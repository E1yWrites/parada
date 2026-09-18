import { Prisma, prisma, GateType, ZoneStatus, CameraStatus, SlotStatus } from "@parada/database";
import type {
  AdminCameraInput,
  AdminCameraUpdateInput,
  AdminZoneCreateInput,
  AdminZoneSlotsInput,
  AdminZoneUpdateInput,
} from "@parada/types";
import { BadRequestError, ConflictError, NotFoundError } from "../http/errors";
import { validateCoordinatePair } from "../http/validate";
import { availabilityOf } from "./availability";
import type { ReservationService } from "./reservation";

/**
 * Zone / camera / physical-inventory CONFIGURATION domain operations.
 *
 * This is the authoritative layer behind the Admin's establishment
 * configuration. Rules enforced here are re-checked by the backend; the Admin
 * frontend never mutates the database directly.
 *
 * CRITICAL DOMAIN INVARIANTS (Phase 11A):
 * - Zone capacity is the authoritative availability metric.
 * - Physical parking slots are INVENTORY / LAYOUT only. They are NOT the
 *   occupancy source, and they are never camera/OCR/reservation/assignment or
 *   navigation targets. Only occupancy events change occupiedCount.
 * - A camera's status is ONLINE (operational) / OFFLINE (disabled). Disabling a
 *   camera (OFFLINE) is safe: historical events/OCR/sessions are untouched, and
 *   the existing pipeline already rejects OFFLINE cameras.
 * - Capacity may never be reduced below current occupancy (nor below what
 *   active reservations protect, matching ReservationService.create).
 * - Configuration changes never rewrite historical occupancy/events.
 */
export class ZoneConfigService {
  private readonly reservations?: ReservationService;

  constructor(options: { reservations?: ReservationService } = {}) {
    this.reservations = options.reservations;
  }

  // ---------------------------------------------------------------------------
  // Zones
  // ---------------------------------------------------------------------------

  async listZones() {
    const zones = await prisma.parkingZone.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        capacity: true,
        occupiedCount: true,
        status: true,
        navigationLat: true,
        navigationLng: true,
        cameras: {
          select: {
            id: true,
            identifier: true,
            name: true,
            gateType: true,
            status: true,
          },
        },
        slots: { select: { id: true, status: true } },
      },
    });
    return zones.map((z) => {
      const physicalInventory = {
        total: z.slots.length,
        active: z.slots.filter((s) => s.status === "ACTIVE").length,
      };
      return {
        ...this.toSummary(z),
        cameras: z.cameras,
        entryCamera: z.cameras.find((c) => c.gateType === "ENTRY") ?? null,
        exitCamera: z.cameras.find((c) => c.gateType === "EXIT") ?? null,
        physicalInventory,
      };
    });
  }

  async createZone(input: AdminZoneCreateInput) {
    const name = requiredLabel("name", input.name);
    const code = requiredLabel("code", input.code);
    const capacity = validateCapacity(input.capacity);
    const description = normalizeDescription(input.description);
    const status: ZoneStatus = input.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    const navigation = validateCoordinatePair(input.navigationLat, input.navigationLng);

    const select = this.zoneSelect();
    try {
      const created = await prisma.parkingZone.create({
        data: { name, code, capacity, occupiedCount: 0, description, status, ...navigation },
        select,
      });
      return this.toSummary(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("A zone with this name or code already exists.");
      }
      throw err;
    }
  }

  async updateZone(zoneId: string, input: AdminZoneUpdateInput) {
    const data: Prisma.ParkingZoneUpdateInput = {};
    if (input.name !== undefined) data.name = requiredLabel("name", input.name);
    if (input.code !== undefined) data.code = requiredLabel("code", input.code);
    if (input.description !== undefined) data.description = normalizeDescription(input.description);
    if (input.status !== undefined) {
      if (input.status !== "ACTIVE" && input.status !== "INACTIVE") {
        throw new BadRequestError("Zone status must be ACTIVE or INACTIVE.");
      }
      data.status = input.status;
    }

    if (input.navigationLat !== undefined || input.navigationLng !== undefined) {
      // Both must be sent together: a lone latitude is never a destination.
      const navigation = validateCoordinatePair(input.navigationLat, input.navigationLng);
      data.navigationLat = navigation.navigationLat;
      data.navigationLng = navigation.navigationLng;
    }

    const capacityRequested = input.capacity !== undefined ? validateCapacity(input.capacity) : undefined;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.parkingZone.findUnique({
          where: { id: zoneId },
          select: { id: true, capacity: true, occupiedCount: true },
        });
        if (!current) throw new NotFoundError(`Zone '${zoneId}' not found.`);

        if (capacityRequested !== undefined) {
          // SAFETY: capacity is authoritative for availability. It must never
          // drop below current occupancy, and it must stay above what active
          // reservations protect (occupied + reserved < capacity), matching the
          // invariant ReservationService.create enforces. A reduction is either
          // rejected outright; we never mutate occupancy/sessions/reservations.
          if (capacityRequested < current.occupiedCount) {
            throw new ConflictError(
              `You cannot reduce this zone below its current occupancy. ` +
                `${current.occupiedCount} of ${current.capacity} spaces are currently occupied.`
            );
          }
          const protecting = this.reservations
            ? await this.reservations.protectingCount(tx, zoneId)
            : 0;
          if (capacityRequested <= current.occupiedCount + protecting) {
            throw new ConflictError(
              `You cannot reduce this zone below its occupied and reserved capacity. ` +
                `(${current.occupiedCount} occupied, ${protecting} reserved, capacity ${current.capacity}).`
            );
          }
          data.capacity = capacityRequested;
        }

        return tx.parkingZone.update({
          where: { id: current.id },
          data,
          select: this.zoneSelect(),
        });
      });

      return this.toSummary(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("A zone with this name or code already exists.");
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Physical slot inventory (layout/visual ONLY - never occupancy authority)
  // ---------------------------------------------------------------------------

  async listSlots(zoneId: string) {
    await this.requireZone(zoneId);
    return prisma.parkingSlot.findMany({
      where: { zoneId },
      orderBy: { slotCode: "asc" },
      select: {
        id: true,
        zoneId: true,
        slotCode: true,
        label: true,
        positionX: true,
        positionY: true,
        status: true,
      },
    });
  }

  /**
   * Reconcile the zone's ACTIVE physical-slot inventory to the given slot codes.
   *
   * Inventory semantics:
   * - Slots are pure physical inventory; occupiedCount and availability are
   *   untouched (only authoritative occupancy events change them).
   * - Active inventory may not exceed the zone's capacity (the repository's
   *   invariant since the seed: slot count starts == capacity and never grows
   *   beyond it). Fewer active slots than capacity simply means some physical
   *   spaces are unavailable.
   * - Removed slots are marked INACTIVE (preserved history), never hard-deleted.
   */
  async setSlots(zoneId: string, input: AdminZoneSlotsInput) {
    if (!Array.isArray(input.slotCodes)) {
      throw new BadRequestError("'slotCodes' must be an array of slot identifiers.");
    }
    const rawCodes = input.slotCodes;
    if (rawCodes.length !== new Set(rawCodes).size) {
      throw new BadRequestError("Slot codes must be unique.");
    }
    const codes = rawCodes.map((c) => requiredLabel("slot code", c));

    return prisma.$transaction(async (tx) => {
      const zone = await tx.parkingZone.findUnique({
        where: { id: zoneId },
        select: { id: true, capacity: true },
      });
      if (!zone) throw new NotFoundError(`Zone '${zoneId}' not found.`);

      if (codes.length > zone.capacity) {
        throw new ConflictError(
          `A zone cannot have more physical spaces than its capacity. ` +
            `Zone capacity is ${zone.capacity}; ${codes.length} spaces requested.`
        );
      }

      const existing = await tx.parkingSlot.findMany({
        where: { zoneId },
        select: { id: true, slotCode: true, label: true, status: true },
      });
      const existingByCode = new Map(existing.map((s) => [s.slotCode, s]));

      for (const code of codes) {
        const slot = existingByCode.get(code);
        if (slot) {
          if (slot.status !== "ACTIVE" || slot.label !== code) {
            await tx.parkingSlot.update({
              where: { id: slot.id },
              data: { label: code, status: "ACTIVE" as SlotStatus },
            });
          }
        } else {
          await tx.parkingSlot.create({
            data: { zoneId, slotCode: code, label: code, status: "ACTIVE" as SlotStatus },
          });
        }
      }

      for (const slot of existing) {
        if (slot.status === "ACTIVE" && !codes.includes(slot.slotCode)) {
          await tx.parkingSlot.update({
            where: { id: slot.id },
            data: { status: "INACTIVE" as SlotStatus },
          });
        }
      }

      return tx.parkingSlot.findMany({
        where: { zoneId },
        orderBy: { slotCode: "asc" },
        select: {
          id: true,
          zoneId: true,
          slotCode: true,
          label: true,
          positionX: true,
          positionY: true,
          status: true,
        },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Cameras (zone-gate infrastructure)
  // ---------------------------------------------------------------------------

  async createCamera(input: AdminCameraInput) {
    const identifier = requiredLabel("identifier", input.identifier);
    const zone = await prisma.parkingZone.findUnique({ where: { id: input.zoneId } });
    if (!zone) throw new NotFoundError(`Zone '${input.zoneId}' not found.`);

    const gateType = validateGateType(input.gateType);
    const status: CameraStatus = input.status === "ONLINE" ? "ONLINE" : "OFFLINE";
    const name = input.name !== undefined ? requiredLabel("name", input.name) : input.identifier;
    const location = normalizeDescription(input.location);

    try {
      const created = await prisma.camera.create({
        data: { zoneId: zone.id, identifier, name, location, gateType, status },
        select: this.cameraSelect(),
      });
      return this.toCamera(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Camera identifier already exists.");
      }
      throw err;
    }
  }

  async updateCamera(cameraId: string, input: AdminCameraUpdateInput) {
    // The identifier is the string every deployed vision host is configured
    // with and POSTs on every event, and it names the camera in every past
    // event and anomaly. Renaming it would silently stop ingestion until each
    // host is reconfigured and relabel history. Refuse loudly rather than
    // dropping the field, so an operator is never left believing it changed.
    if ("identifier" in (input as Record<string, unknown>)) {
      throw new BadRequestError(
        "'identifier' cannot be changed after registration; register a new camera instead."
      );
    }
    const data: Prisma.CameraUpdateInput = {};
    if (input.name !== undefined) data.name = requiredLabel("name", input.name);
    if (input.location !== undefined) data.location = normalizeDescription(input.location);
    if (input.gateType !== undefined) data.gateType = validateGateType(input.gateType);
    if (input.status !== undefined) {
      if (input.status !== "ONLINE" && input.status !== "OFFLINE") {
        throw new BadRequestError("Camera status must be ONLINE or OFFLINE.");
      }
      data.status = input.status;
    }
    if (input.zoneId !== undefined) {
      const zone = await prisma.parkingZone.findUnique({ where: { id: input.zoneId } });
      if (!zone) throw new NotFoundError(`Zone '${input.zoneId}' not found.`);
      data.zone = { connect: { id: input.zoneId } };
    }

    try {
      const updated = await prisma.camera.update({
        where: { id: cameraId },
        data,
        select: this.cameraSelect(),
      });
      return this.toCamera(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          throw new NotFoundError(`Camera '${cameraId}' not found.`);
        }
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private zoneSelect() {
    return {
      id: true,
      name: true,
      code: true,
      description: true,
      capacity: true,
      occupiedCount: true,
      status: true,
      navigationLat: true,
      navigationLng: true,
    } satisfies Prisma.ParkingZoneSelect;
  }

  private cameraSelect(): Prisma.CameraSelect {
    return {
      id: true,
      identifier: true,
      name: true,
      location: true,
      gateType: true,
      status: true,
      zoneId: true,
      zone: { select: { id: true, name: true, code: true } },
    };
  }

  private toSummary(z: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    capacity: number;
    occupiedCount: number;
    status: ZoneStatus;
    navigationLat: number | null;
    navigationLng: number | null;
  }) {
    return {
      id: z.id,
      name: z.name,
      code: z.code,
      description: z.description,
      capacity: z.capacity,
      occupiedCount: z.occupiedCount,
      availableCount: Math.max(0, z.capacity - z.occupiedCount),
      occupancyPct: z.capacity > 0 ? (z.occupiedCount / z.capacity) * 100 : 0,
      status: z.status,
      availability: availabilityOf(z.occupiedCount, z.capacity, z.status),
      navigationLat: z.navigationLat,
      navigationLng: z.navigationLng,
    };
  }

  private toCamera(c: {
    id: string;
    identifier: string;
    name: string;
    location: string | null;
    gateType: GateType;
    status: CameraStatus;
    zoneId: string;
    zone: { id: string; name: string; code: string };
  }) {
    return {
      id: c.id,
      identifier: c.identifier,
      name: c.name,
      location: c.location,
      gateType: c.gateType,
      status: c.status,
      zone: c.zone,
      recentEvents: [] as {
        id: string;
        cameraId: string | null;
        eventType: "ENTRY" | "EXIT";
        detectedPlate: string | null;
        detectedAt: string;
      }[],
    };
  }

  private async requireZone(zoneId: string) {
    const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundError(`Zone '${zoneId}' not found.`);
  }
}

function requiredLabel(field: "name" | "code" | "identifier" | "slot code", value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError(`'${field}' is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 120) {
    throw new BadRequestError(`'${field}' must be 120 characters or fewer.`);
  }
  return trimmed;
}

function validateCapacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new BadRequestError("Zone capacity must be a positive integer.");
  }
  return value;
}

function normalizeDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequestError("Description must be a string.");
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 500);
}

function validateGateType(value: unknown): GateType {
  if (value !== "ENTRY" && value !== "EXIT" && value !== "BIDIRECTIONAL") {
    throw new BadRequestError("Camera gate direction must be ENTRY, EXIT, or BIDIRECTIONAL.");
  }
  return value;
}