import { prisma, Prisma, normalizePlate } from "@parada/database";
import type { Vehicle, VehicleCreateInput, VehicleType, VehicleUpdateInput } from "@parada/types";
import { BadRequestError, ConflictError, NotFoundError, UnprocessableError } from "../http/errors";
import { optionalLabel } from "../http/validate";

const VEHICLE_TYPES: readonly VehicleType[] = ["CAR", "MOTORCYCLE", "VAN", "TRUCK", "OTHER"];

export type VehicleResponse = Omit<Vehicle, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };

function validatePlate(raw: unknown): { plateNumber: string; normalizedPlate: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new BadRequestError("'plateNumber' (string) is required.");
  }
  const plateNumber = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const normalizedPlate = normalizePlate(plateNumber);
  if (normalizedPlate.length < 2 || normalizedPlate.length > 12) {
    throw new UnprocessableError("Plate number must contain 2–12 letters or digits.");
  }
  return { plateNumber, normalizedPlate };
}

function validateType(raw: unknown): VehicleType {
  if (typeof raw !== "string") {
    throw new BadRequestError("'vehicleType' (string) is required.");
  }
  if (!VEHICLE_TYPES.includes(raw as VehicleType)) {
    throw new BadRequestError(`'vehicleType' must be one of: ${VEHICLE_TYPES.join(", ")}.`);
  }
  return raw as VehicleType;
}

/**
 * Driver-owned vehicle lifecycle. The plate is the gate identity, so every
 * change that could confuse the camera pipeline (re-plating or unregistering
 * a vehicle that is parked, assigned or reserved) is refused with a domain
 * conflict rather than silently allowed. Unregistering never deletes: the
 * row becomes INACTIVE and historical sessions/violations/fees keep pointing
 * at it. Ownership is enforced by scoping every lookup to the caller's id.
 */
export class VehicleService {
  async list(userId: string) {
    return prisma.vehicle.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  }

  async get(userId: string, vehicleId: string) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId, status: "ACTIVE" } });
    if (!vehicle) {
      throw new NotFoundError("Vehicle not found.");
    }
    return vehicle;
  }

  /**
   * Registers a plate. Re-registering a plate this user previously
   * unregistered reactivates the same row (keeping its history) instead of
   * tripping the per-user unique index. A plate ACTIVE on another account is
   * refused: the database's partial unique index is the authority.
   */
  async create(userId: string, input: VehicleCreateInput) {
    const { plateNumber, normalizedPlate } = validatePlate(input.plateNumber);
    const vehicleType = validateType(input.vehicleType);
    const details = {
      make: optionalLabel(input.make, "make") ?? null,
      model: optionalLabel(input.model, "model") ?? null,
      color: optionalLabel(input.color, "color", 30) ?? null,
    };

    const existing = await prisma.vehicle.findUnique({
      where: { userId_normalizedPlate: { userId, normalizedPlate } },
    });
    if (existing && existing.status === "ACTIVE") {
      throw new UnprocessableError("You already have a vehicle with this plate number.");
    }
    try {
      if (existing) {
        return await prisma.vehicle.update({
          where: { id: existing.id },
          data: { plateNumber, vehicleType, status: "ACTIVE", ...details },
        });
      }
      return await prisma.vehicle.create({
        data: { userId, plateNumber, normalizedPlate, vehicleType, status: "ACTIVE", ...details },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("This plate number is already registered to another account.");
      }
      throw err;
    }
  }

  async update(userId: string, vehicleId: string, input: VehicleUpdateInput) {
    const vehicle = await this.get(userId, vehicleId);
    const data: Prisma.VehicleUpdateInput = {};
    if (input.vehicleType !== undefined) data.vehicleType = validateType(input.vehicleType);
    const make = optionalLabel(input.make, "make");
    if (make !== undefined) data.make = make;
    const model = optionalLabel(input.model, "model");
    if (model !== undefined) data.model = model;
    const color = optionalLabel(input.color, "color", 30);
    if (color !== undefined) data.color = color;

    if (input.plateNumber !== undefined) {
      const plate = validatePlate(input.plateNumber);
      if (plate.normalizedPlate !== vehicle.normalizedPlate) {
        // The plate is what the gate camera matches: it cannot change while
        // this vehicle is parked, assigned, or holding a reservation.
        await this.assertNotInUse(vehicle.id, "change the plate number of");
        data.normalizedPlate = plate.normalizedPlate;
      }
      data.plateNumber = plate.plateNumber;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestError("Nothing to update.");
    }
    try {
      return await prisma.vehicle.update({ where: { id: vehicle.id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("This plate number is already registered.");
      }
      throw err;
    }
  }

  /** Unregister: INACTIVE, never deleted. Refused while the vehicle is in use. */
  async deactivate(userId: string, vehicleId: string) {
    const vehicle = await this.get(userId, vehicleId);
    await this.assertNotInUse(vehicle.id, "unregister");
    const flipped = await prisma.vehicle.updateMany({
      where: { id: vehicle.id, userId, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    if (flipped.count !== 1) {
      throw new NotFoundError("Vehicle not found.");
    }
    return prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
  }

  /**
   * A vehicle is "in use" while it has an ACTIVE parking session, an
   * unexpired ACTIVE zone assignment, or a reservation that is still live
   * (PENDING / CONFIRMED / ACTIVE and not past its window).
   */
  private async assertNotInUse(vehicleId: string, action: string): Promise<void> {
    const now = new Date();
    const [session, assignment, reservation] = await Promise.all([
      prisma.parkingSession.findFirst({ where: { vehicleId, status: "ACTIVE" }, select: { id: true } }),
      prisma.zoneAssignment.findFirst({
        where: { vehicleId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { id: true },
      }),
      prisma.reservation.findFirst({
        where: { vehicleId, status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] }, endAt: { gt: now } },
        select: { id: true },
      }),
    ]);
    if (session) {
      throw new ConflictError(`You cannot ${action} a vehicle with an active parking session.`, {
        reason: "ACTIVE_SESSION",
      });
    }
    if (assignment) {
      throw new ConflictError(`You cannot ${action} a vehicle with an active zone assignment. Cancel the assignment first.`, {
        reason: "ACTIVE_ASSIGNMENT",
      });
    }
    if (reservation) {
      throw new ConflictError(`You cannot ${action} a vehicle with an upcoming reservation. Cancel the reservation first.`, {
        reason: "ACTIVE_RESERVATION",
      });
    }
  }
}
