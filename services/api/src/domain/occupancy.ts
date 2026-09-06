import { Prisma, prisma } from "@parada/database";
import { normalizePlate } from "@parada/database";
import {
  ZONE_OCCUPANCY_LOW_THRESHOLD,
  DEFAULT_OCR_CONFIDENCE_THRESHOLD,
} from "@parada/config";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../http/errors";
import type {
  OccupancyEventType,
  OccupancySource,
} from "@parada/database";
import type { ConfigService } from "./config";
import { persistSessionFee } from "./fees";
import type { AssignmentService } from "./assignment";
import type { ReservationService } from "./reservation";
import type { ViolationService } from "./violations";
import type { GuestPolicyConfig } from "@parada/types";

/**
 * The normalized vision-event contract — the boundary between the camera/vision
 * layer and the backend. Cameras / OCR produce this shape; the backend never
 * depends on a specific vision implementation.
 */
export interface NormalizedVisionEvent {
  /** Client-supplied idempotency key unique per camera. */
  sourceEventId: string;
  /** Stable identifier of the camera that produced the event. */
  cameraIdentifier: string;
  /** Physical gate direction, ENTRY (into the zone) or EXIT (out of the zone). */
  eventType: OccupancyEventType;
  /** Raw plate string as produced by OCR (optional — may be absent/unreadable). */
  detectedPlate?: string | null;
  /** OCR confidence [0..1]; below the configured threshold it is not trusted. */
  ocrConfidence?: number | null;
  /** Time the camera observed the event (optional; defaults to now). */
  detectedAt?: string | null;
}

export interface OccupancyInput extends NormalizedVisionEvent {
  zoneId: string;
}
export interface VehicleMatch {
  vehicleId: string | null;
  detectedPlate: string | null;
  normalizedPlate: string | null;
  ocrConfidence: number | null;
  plateMatched: boolean;
}

export interface OccupancyServiceOptions {
  /** Plates whose OCR confidence is below this threshold are not trusted. */
  ocrPlateConfidenceThreshold?: number;
  /** Resolves the runtime guest-admission policy (policy + primary zone). */
  config?: ConfigService;
  /** Resolves active zone assignments for wrong-zone detection. */
  assignments?: AssignmentService;
  /** Resolves how many spaces other parties' reservations are holding. */
  reservations?: ReservationService;
  /** Escalates repeated wrong-zone entries into establishment violations. */
  violations?: ViolationService;
}

/**
 * Result of processing a camera event for a plate that did NOT resolve to a
 * registered vehicle (a guest candidate). Includes the admission decision so a
 * denied guest is observable without mutating occupancy.
 */
export interface GuestAdmissionResult {
  admitted: boolean;
  deniedReason: string | null;
  /** anomaly type recorded for this event (GUEST_DENIED / GUEST_ADMITTED / ...). */
  anomalyType: string | null;
  guestSessionId: string | null;
}

export interface ProcessEventOptions {
  /** Id of an ADMIN who is explicitly overriding the guest policy (auditable). */
  overrideAdminUserId?: string;
}

export class OccupancyService {
  private readonly ocrPlateConfidenceThreshold: number;
  private readonly config?: ConfigService;
  private readonly assignments?: AssignmentService;
  private readonly reservations?: ReservationService;
  private readonly violations?: ViolationService;

  constructor(options: OccupancyServiceOptions = {}) {
    // Default 0.5: an absent confidence signal is treated as "trusted" (a
    // vision service that provides no confidence is by policy considered
    // reliable), but an explicitly low confidence is not used for identity.
    this.ocrPlateConfidenceThreshold =
      options.ocrPlateConfidenceThreshold ?? DEFAULT_OCR_CONFIDENCE_THRESHOLD;
    this.config = options.config;
    this.assignments = options.assignments;
    this.reservations = options.reservations;
    this.violations = options.violations;
  }

  /**
   * Determine whether a provided OCR confidence is reliable enough to use as a
   * vehicle identity. Absent confidence = trusted; explicit low confidence is
   * not treated as reliable. [IMPLEMENTATION DECISION]
   */
  private isPlateTrusted(ocrConfidence: number | null): boolean {
    if (ocrConfidence === null || ocrConfidence === undefined) {
      return true;
    }
    return ocrConfidence >= this.ocrPlateConfidenceThreshold;
  }

  /**
   * Resolve plate signals into a (possibly null) registered-vehicle match.
   * A match is only established when the plate is trusted (OCR confidence at or
   * above threshold) AND exactly one registered vehicle owns the normalized
   * plate. Unknown, ambiguous (multiple-owner), or low-confidence plates yield
   * no match -> the event is recorded but no session is created.
   * [IMPLEMENTATION DECISION]
   */
  private async matchVehicle(
    detectedPlate: string | null,
    ocrConfidence: number | null
  ): Promise<VehicleMatch> {
    const trusted = this.isPlateTrusted(ocrConfidence);
    if (!detectedPlate || !trusted) {
      return {
        vehicleId: null,
        detectedPlate,
        normalizedPlate: detectedPlate ? normalizePlate(detectedPlate) : null,
        ocrConfidence,
        plateMatched: false,
      };
    }
    const normalized = normalizePlate(detectedPlate);
    const vehicles = await prisma.vehicle.findMany({
      where: { normalizedPlate: normalized, status: "ACTIVE" },
      take: 2,
    });
    if (vehicles.length === 1) {
      const vehicle = vehicles[0]!;
      return {
        vehicleId: vehicle.id,
        detectedPlate,
        normalizedPlate: vehicle.normalizedPlate,
        ocrConfidence,
        plateMatched: true,
      };
    }
    return {
      vehicleId: null,
      detectedPlate,
      normalizedPlate: normalized,
      ocrConfidence,
      plateMatched: false,
    };
  }

  /**
   * Validate camera identity, zone membership, online status, and gate
   * direction compatibility. ENTRY cameras accept only ENTRY events; EXIT
   * cameras only EXIT; BIDIRECTIONAL accepts both. [IMPLEMENTATION DECISION]
   */
  private async validateCamera(zoneId: string, cameraIdentifier: string) {
    const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundError(`Zone '${zoneId}' not found.`);
    }

    const camera = await prisma.camera.findUnique({ where: { identifier: cameraIdentifier } });
    if (!camera) {
      throw new NotFoundError(`Camera '${cameraIdentifier}' not found.`);
    }
    if (camera.zoneId !== zoneId) {
      throw new ConflictError(
        `Camera '${cameraIdentifier}' does not belong to zone '${zoneId}'.`
      );
    }
    return { zone, camera };
  }

  /**
   * The single write-point for an occupancy change. Runs in one transaction:
   * resolve camera -> validate direction/status -> classify the plate (registered
   * vehicle vs. guest candidate) -> apply admission policy -> update zone -> insert
   * event + history -> create/close session (registered or guest) -> record any
   * anomaly -> honor/consume reservations -> detect wrong-zone. Returns the created
   * OccupancyEvent, or (for a CAMERA-sourced guest) a GuestAdmissionResult that
   * carries the admission decision alongside the recorded occupancy event.
   */
  async processEvent(
    input: OccupancyInput,
    source: OccupancySource = "CAMERA",
    options: ProcessEventOptions = {}
  ) {
    const { zoneId, cameraIdentifier, sourceEventId, eventType } = input;

    const { zone, camera } = await this.validateCamera(zoneId, cameraIdentifier);

    if (camera.status === "OFFLINE") {
      throw new ConflictError(`Camera '${cameraIdentifier}' is offline and cannot accept events.`);
    }

    if (camera.gateType !== "BIDIRECTIONAL") {
      const compatible =
        (eventType === "ENTRY" && camera.gateType === "ENTRY") ||
        (eventType === "EXIT" && camera.gateType === "EXIT");
      if (!compatible) {
        throw new ConflictError(
          `Camera '${cameraIdentifier}' is a ${camera.gateType} gate and cannot accept a ${eventType} event.`
        );
      }
    }

    const match = await this.matchVehicle(input.detectedPlate ?? null, input.ocrConfidence ?? null);

    const detectedAt = input.detectedAt ? new Date(input.detectedAt) : new Date();

    try {
      return await prisma.$transaction(async (tx) => {
        if (match.vehicleId) {
          // ---- REGISTERED VEHICLE path ----
          return await this.processRegisteredVehicle(tx, {
            zone,
            camera,
            match,
            eventType,
            source,
            sourceEventId,
            detectedAt,
          });
        }
        // ---- GUEST candidate path (unknown / low-confidence plate) ----
        return await this.processGuest(tx, {
          zone,
          camera,
          match,
          eventType,
          source,
          sourceEventId,
          detectedAt,
        }, options);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError(
          `Duplicate camera event for sourceEventId '${sourceEventId}'.`,
          { target: err.meta?.target }
        );
      }
      throw err;
    }
  }

  /** Effective fee configuration, falling back to the shared default. */
  private async getFeeConfig() {
    if (this.config) {
      return this.config.getParkingFeeConfig();
    }
    const { DEFAULT_PARKING_FEE } = await import("@parada/config");
    return { ...DEFAULT_PARKING_FEE };
  }

  /**
   * The ONLY way occupancy changes. A conditional `updateMany` applies the
   * delta atomically — the guard lives in the WHERE clause, so two concurrent
   * events cannot both read the same count and both write it back (a lost
   * update). The real post-write state is then read inside the same
   * transaction, so the recorded event/history counts are never invented.
   *
   * Returns null instead of throwing when the guard rejects, because guest
   * ENTRY must record a denial rather than abort the transaction.
   */
  private async applyOccupancy(
    tx: Prisma.TransactionClient,
    zone: { id: string; capacity: number },
    eventType: OccupancyEventType
  ): Promise<{ previousOccupied: number; newOccupied: number; availableCount: number } | null> {
    const applied =
      eventType === "ENTRY"
        ? await tx.parkingZone.updateMany({
            where: { id: zone.id, occupiedCount: { lt: zone.capacity } },
            data: { occupiedCount: { increment: 1 } },
          })
        : await tx.parkingZone.updateMany({
            where: { id: zone.id, occupiedCount: { gt: 0 } },
            data: { occupiedCount: { decrement: 1 } },
          });
    if (applied.count !== 1) {
      return null;
    }
    const { occupiedCount } = await tx.parkingZone.findUniqueOrThrow({
      where: { id: zone.id },
      select: { occupiedCount: true },
    });
    return {
      previousOccupied: eventType === "ENTRY" ? occupiedCount - 1 : occupiedCount + 1,
      newOccupied: occupiedCount,
      availableCount: zone.capacity - occupiedCount,
    };
  }

  /**
   * True when every remaining space in the zone is already held by someone
   * else's reservation. A reservation protects a space without moving
   * occupiedCount, so the raw capacity guard alone would let a walk-up take it.
   */
  private async reservedOut(
    tx: Prisma.TransactionClient,
    zone: { id: string; capacity: number },
    exclude?: { userId: string; vehicleId: string }
  ): Promise<boolean> {
    if (!this.reservations) {
      return false;
    }
    const held = await this.reservations.protectingCount(tx, zone.id, exclude);
    if (held === 0) {
      return false;
    }
    const { occupiedCount } = await this.currentOccupancy(tx, zone);
    return occupiedCount + held >= zone.capacity;
  }

  /** Current occupancy read inside the transaction (for events that change nothing). */
  private async currentOccupancy(tx: Prisma.TransactionClient, zone: { id: string; capacity: number }) {
    const { occupiedCount } = await tx.parkingZone.findUniqueOrThrow({
      where: { id: zone.id },
      select: { occupiedCount: true },
    });
    return { occupiedCount, availableCount: zone.capacity - occupiedCount };
  }

  /**
   * Registered-vehicle entry/exit. For ENTRY this honors/consumes an active
   * reservation for the actual zone and issues a WRONG-ZONE WARNING (admit but
   * flag) when the vehicle's active assignment targets a different zone. The
   * zone assignment is never silently changed, and a recommendation alone never
   * triggers a warning.
   */
  private async processRegisteredVehicle(
    tx: Prisma.TransactionClient,
    ctx: {
      zone: { id: string; capacity: number; occupiedCount: number };
      camera: { id: string };
      match: VehicleMatch;
      eventType: OccupancyEventType;
      source: OccupancySource;
      sourceEventId: string;
      detectedAt: Date;
    }
  ) {
    const { zone, camera, match, eventType, source, sourceEventId, detectedAt } = ctx;
    const vehicleId = match.vehicleId!;

    // Wrong-zone warning applies only to registered ENTRY events. A
    // recommendation is not an assignment, and EXIT does not need an
    // assignment lookup.
    let wrongZone = false;
    let assignedZoneCode: string | null = null;
    if (eventType === "ENTRY" && this.assignments) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { userId: true },
      });
      if (vehicle) {
        const active = await this.assignments.getActiveForVehicle(vehicle.userId, vehicleId);
        if (active && active.zoneId !== zone.id) {
          wrongZone = true;
          assignedZoneCode = active.zone.code;
        }
      }
    }

    if (eventType !== "ENTRY" && eventType !== "EXIT") {
      throw new BadRequestError(`Unsupported event type: '${String(eventType)}'.`);
    }

    // A space held by someone else's reservation is not available to this
    // vehicle, even though occupiedCount has not moved. The vehicle's own
    // reservation is excluded so a holder is never blocked by their own booking.
    if (eventType === "ENTRY") {
      const vehicleOwner = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { userId: true },
      });
      if (
        vehicleOwner &&
        (await this.reservedOut(tx, zone, { userId: vehicleOwner.userId, vehicleId }))
      ) {
        throw new ConflictError(`Zone '${zone.id}' is already full.`, {
          capacity: zone.capacity,
          reserved: true,
        });
      }
    }

    // Occupancy bounds (registered vehicles do NOT get guest overflow),
    // enforced atomically so concurrent events cannot lose an update.
    const applied = await this.applyOccupancy(tx, zone, eventType);
    if (!applied) {
      throw eventType === "ENTRY"
        ? new ConflictError(`Zone '${zone.id}' is already full.`, { capacity: zone.capacity })
        : new ConflictError(`Zone '${zone.id}' has no occupancy to release.`);
    }
    const { previousOccupied, newOccupied, availableCount } = applied;

    // Only a successful registered ENTRY consumes an in-window reservation.
    // Failed/full entries must leave the reservation available.
    if (eventType === "ENTRY") {
      await this.consumeReservationForZone(tx, match, zone.id, detectedAt);
    }

    const event = await tx.occupancyEvent.create({
      data: {
        zoneId: zone.id,
        cameraId: camera.id,
        eventType,
        previousOccupied,
        newOccupied,
        availableCount,
        source,
        sourceEventId: sourceEventId || null,
        vehicleId,
        detectedPlate: match.detectedPlate,
        normalizedPlate: match.normalizedPlate,
        ocrConfidence: match.ocrConfidence,
        plateMatched: match.plateMatched,
        detectedAt,
      },
    });

    await tx.occupancyHistory.create({
      data: {
        zoneId: zone.id,
        occupiedCount: newOccupied,
        availableCount,
        occurredAt: detectedAt,
      },
    });

    await this.maybeNotify(tx, {
      zoneId: zone.id,
      capacity: zone.capacity,
      previousOccupied,
      newOccupied,
      availableCount,
    });

    if (eventType === "ENTRY") {
      const vehicle = await tx.vehicle.findUniqueOrThrow({
        where: { id: vehicleId },
        include: { user: true },
      });
      await tx.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: vehicle.userId,
          vehicleId: vehicle.id,
          entryEventId: event.id,
          enteredAt: detectedAt,
          status: "ACTIVE",
        },
      });

      if (wrongZone) {
        // Escalate BEFORE recording this entry's warning, so the count
        // reflects previous offences only. First offences stay warnings.
        await this.violations?.escalateWrongZone(tx, {
          userId: vehicle.userId,
          vehicleId,
          zoneId: zone.id,
          assignedZoneCode: assignedZoneCode ?? "unknown",
        });
        await tx.occupancyAnomaly.create({
          data: {
            occupancyEventId: event.id,
            cameraId: camera.id,
            vehicleId,
            detectedPlate: match.detectedPlate,
            anomalyType: "WRONG_ZONE_WARNING",
            description: `Vehicle is assigned to zone '${assignedZoneCode}' but entered zone '${zone.id}'.`,
            resolved: false,
          },
        });
        await tx.notification.create({
          data: {
            zoneId: zone.id,
            userId: vehicle.userId,
            type: "WRONG_ZONE_WARNING",
            message: `Your vehicle (${match.detectedPlate}) entered a zone different from your assigned zone.`,
            targetRole: "USER",
          },
        });
      }
    } else if (eventType === "EXIT") {
      const existing = await tx.parkingSession.findFirst({
        where: { vehicleId, status: "ACTIVE" },
        orderBy: { enteredAt: "asc" },
      });
      if (existing) {
        const durationMs = Math.max(0, detectedAt.getTime() - existing.enteredAt.getTime());
        const { amount } = await persistSessionFee(tx, {
          sessionId: existing.id,
          zoneId: existing.zoneId,
          userId: existing.userId,
          durationMs,
          feeConfig: await this.getFeeConfig(),
        });
        await tx.parkingSession.update({
          where: { id: existing.id },
          data: {
            exitEventId: event.id,
            exitedAt: detectedAt,
            durationSeconds: Math.floor(durationMs / 1000),
            feeAmount: amount,
            status: "COMPLETED",
          },
        });
      } else {
        await tx.occupancyAnomaly.create({
          data: {
            occupancyEventId: event.id,
            cameraId: camera.id,
            vehicleId,
            detectedPlate: match.detectedPlate,
            anomalyType: "EXIT_WITHOUT_ACTIVE_SESSION",
            description: `EXIT for plate '${match.detectedPlate}' with no active parking session.`,
            resolved: false,
          },
        });
      }
    }

    return event;
  }

  /**
   * Guest-candidate entry/exit. For CAMERA-sourced events the guest admission
   * policy (PRIMARY_ZONE primary-zone + full-zone denial + null-zone fail-safe)
   * is enforced; a denied entry leaves occupancy unchanged but is recorded as an
   * auditable anomaly (GUEST_DENIED). An authorized ADMIN override admits the
   * guest and is itself recorded (GUEST_ADMIN_OVERRIDE). For SIMULATOR-sourced
   * events (admin demo/ops injection) legacy unknown handling is preserved.
   */
  private async processGuest(
    tx: Prisma.TransactionClient,
    ctx: {
      zone: { id: string; code: string; capacity: number; occupiedCount: number };
      camera: { id: string };
      match: VehicleMatch;
      eventType: OccupancyEventType;
      source: OccupancySource;
      sourceEventId: string;
      detectedAt: Date;
    },
    options: ProcessEventOptions
  ) {
    const { zone, camera, match, eventType, source, sourceEventId, detectedAt } = ctx;

    // SIMULATOR source: legacy unknown handling (count occupancy, no guest
    // session). Keeps the admin/demo simulator behavior intact.
    if (source !== "CAMERA") {
      const applied = await this.applyOccupancy(tx, zone, eventType);
      if (!applied) {
        throw eventType === "ENTRY"
          ? new ConflictError(`Zone '${zone.id}' is already full.`, { capacity: zone.capacity })
          : new ConflictError(`Zone '${zone.id}' has no occupancy to release.`);
      }
      const { previousOccupied, newOccupied, availableCount } = applied;

      const event = await tx.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType,
          previousOccupied,
          newOccupied,
          availableCount,
          source,
          sourceEventId: sourceEventId || null,
          vehicleId: null,
          detectedPlate: match.detectedPlate,
          normalizedPlate: match.normalizedPlate,
          ocrConfidence: match.ocrConfidence,
          plateMatched: false,
          detectedAt,
        },
      });

      await tx.occupancyHistory.create({
        data: {
          zoneId: zone.id,
          occupiedCount: newOccupied,
          availableCount,
          occurredAt: detectedAt,
        },
      });

      await this.maybeNotify(tx, {
        zoneId: zone.id,
        capacity: zone.capacity,
        previousOccupied,
        newOccupied,
        availableCount,
      });

      if (eventType === "ENTRY") {
        const reason =
          match.detectedPlate && !this.isPlateTrusted(match.ocrConfidence)
            ? "LOW_CONFIDENCE_PLATE"
            : "UNREGISTERED_PLATE";
        await tx.occupancyAnomaly.create({
          data: {
            occupancyEventId: event.id,
            cameraId: camera.id,
            vehicleId: null,
            detectedPlate: match.detectedPlate,
            anomalyType: reason,
            description:
              reason === "LOW_CONFIDENCE_PLATE"
                ? `ENTRY with plate '${match.detectedPlate}' below confidence threshold; identity not trusted.`
                : `ENTRY with ${match.detectedPlate === null ? "no detected plate" : `unknown plate '${match.detectedPlate}'`}; no registered vehicle.`,
            resolved: false,
          },
        });
      }
      return event;
    }

    // ---------------- CAMERA-sourced guest ----------------
    if (eventType === "EXIT") {
      // Only a guest that actually entered (has an active GuestSession) may
      // release occupancy. A denied-or-never-admitted guest EXIT must NOT
      // decrement (spec §10).
      const normalized = match.normalizedPlate;
      const guestSessionRow = await tx.guestSession.findFirst({
        where: {
          ...(normalized ? { detectedPlate: normalized } : { detectedPlate: null }),
          session: { status: "ACTIVE" },
        },
        include: { session: true },
        orderBy: { createdAt: "desc" },
      });
      if (guestSessionRow && guestSessionRow.session.zoneId === zone.id) {
        const released = await this.applyOccupancy(tx, zone, eventType);
        if (!released) {
          throw new ConflictError(`Zone '${zone.id}' has no occupancy to release.`);
        }
        const { previousOccupied: releaseFrom, newOccupied, availableCount } = released;

        const event = await tx.occupancyEvent.create({
          data: {
            zoneId: zone.id,
            cameraId: camera.id,
            eventType,
            previousOccupied: releaseFrom,
            newOccupied,
            availableCount,
            source,
            sourceEventId: sourceEventId || null,
            vehicleId: null,
            detectedPlate: match.detectedPlate,
            normalizedPlate: match.normalizedPlate,
            ocrConfidence: match.ocrConfidence,
            plateMatched: false,
            detectedAt,
          },
        });

        await tx.occupancyHistory.create({
          data: {
            zoneId: zone.id,
            occupiedCount: newOccupied,
            availableCount,
            occurredAt: detectedAt,
          },
        });

        await this.maybeNotify(tx, {
          zoneId: zone.id,
          capacity: zone.capacity,
          previousOccupied: releaseFrom,
          newOccupied,
          availableCount,
        });

        const durationMs = Math.max(
          0,
          detectedAt.getTime() - guestSessionRow.session.enteredAt.getTime()
        );
        // Guests are charged under the same fee policy; they simply have no user.
        const { amount } = await persistSessionFee(tx, {
          sessionId: guestSessionRow.session.id,
          zoneId: guestSessionRow.session.zoneId,
          userId: guestSessionRow.session.userId,
          durationMs,
          feeConfig: await this.getFeeConfig(),
        });
        await tx.parkingSession.update({
          where: { id: guestSessionRow.session.id },
          data: {
            exitEventId: event.id,
            exitedAt: detectedAt,
            durationSeconds: Math.floor(durationMs / 1000),
            feeAmount: amount,
            status: "COMPLETED",
          },
        });

        return this.guestResult(event, {
          admitted: true,
          deniedReason: null,
          anomalyType: null,
          guestSessionId: guestSessionRow.session.id,
        });
      }

      // No active guest session in this zone. This also covers a guest trying
      // to exit through a different zone than the one where it entered.
      // Occupancy is deliberately unchanged, so record the real current state.
      const unchanged = await this.currentOccupancy(tx, zone);
      const event = await tx.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType,
          previousOccupied: unchanged.occupiedCount,
          newOccupied: unchanged.occupiedCount,
          availableCount: unchanged.availableCount,
          source,
          sourceEventId: sourceEventId || null,
          vehicleId: null,
          detectedPlate: match.detectedPlate,
          normalizedPlate: match.normalizedPlate,
          ocrConfidence: match.ocrConfidence,
          plateMatched: false,
          detectedAt,
        },
      });
      await tx.occupancyAnomaly.create({
        data: {
          occupancyEventId: event.id,
          cameraId: camera.id,
          vehicleId: null,
          detectedPlate: match.detectedPlate,
          anomalyType:
            guestSessionRow && guestSessionRow.session.zoneId !== zone.id
              ? "GUEST_EXIT_WRONG_ZONE"
              : "GUEST_EXIT_WITHOUT_SESSION",
          description:
            guestSessionRow && guestSessionRow.session.zoneId !== zone.id
              ? `Guest EXIT for plate '${match.detectedPlate ?? "unknown"}' used zone '${zone.id}', but the active guest session belongs to zone '${guestSessionRow.session.zoneId}'.`
              : `Guest EXIT for plate '${match.detectedPlate ?? "unknown"}' with no active guest session.`,
          resolved: false,
        },
      });
      return this.guestResult(event, {
        admitted: false,
        deniedReason:
          guestSessionRow && guestSessionRow.session.zoneId !== zone.id
            ? "GUEST_EXIT_WRONG_ZONE"
            : "GUEST_EXIT_WITHOUT_SESSION",
        anomalyType:
          guestSessionRow && guestSessionRow.session.zoneId !== zone.id
            ? "GUEST_EXIT_WRONG_ZONE"
            : "GUEST_EXIT_WITHOUT_SESSION",
        guestSessionId: null,
      });
    }

    // ENTRY -> guest admission decision. Policy eligibility is decided from
    // configuration; the capacity verdict comes from the atomic increment
    // itself, so a full zone can never be misread from a stale snapshot.
    const decision = await this.decideGuestAdmission(zone, options);
    let admitted = decision.admitted;
    let deniedReason: string | null = decision.deniedReason;
    let counts: { previousOccupied: number; newOccupied: number; availableCount: number };

    // A guest must never take a space someone has reserved.
    if (admitted && (await this.reservedOut(tx, zone))) {
      admitted = false;
      deniedReason = "GUEST_ZONE_FULL";
    }

    const applied = admitted ? await this.applyOccupancy(tx, zone, "ENTRY") : null;
    if (admitted && !applied) {
      admitted = false;
      deniedReason = "GUEST_ZONE_FULL";
    }
    if (applied) {
      counts = applied;
    } else {
      const unchanged = await this.currentOccupancy(tx, zone);
      counts = {
        previousOccupied: unchanged.occupiedCount,
        newOccupied: unchanged.occupiedCount,
        availableCount: unchanged.availableCount,
      };
    }
    const { previousOccupied, newOccupied, availableCount } = counts;

    const event = await tx.occupancyEvent.create({
      data: {
        zoneId: zone.id,
        cameraId: camera.id,
        eventType,
        previousOccupied,
        newOccupied,
        availableCount,
        source,
        sourceEventId: sourceEventId || null,
        vehicleId: null,
        detectedPlate: match.detectedPlate,
        normalizedPlate: match.normalizedPlate,
        ocrConfidence: match.ocrConfidence,
        plateMatched: false,
        detectedAt,
      },
    });

    await tx.occupancyHistory.create({
      data: {
        zoneId: zone.id,
        occupiedCount: newOccupied,
        availableCount,
        occurredAt: detectedAt,
      },
    });

    if (admitted) {
      await this.maybeNotify(tx, {
        zoneId: zone.id,
        capacity: zone.capacity,
        previousOccupied,
        newOccupied,
        availableCount,
      });

      // Account-less guest parking session (userId/vehicleId null) wrapping a
      // GuestSession identified by the detected plate.
      const session = await tx.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: null,
          vehicleId: null,
          entryEventId: event.id,
          enteredAt: detectedAt,
          status: "ACTIVE",
        },
      });
      await tx.guestSession.create({
        data: {
          parkingSessionId: session.id,
          detectedPlate: match.normalizedPlate ?? match.detectedPlate ?? null,
        },
      });

      const anomalyType = options.overrideAdminUserId
        ? "GUEST_ADMIN_OVERRIDE"
        : "GUEST_ADMITTED";
      await tx.occupancyAnomaly.create({
        data: {
          occupancyEventId: event.id,
          cameraId: camera.id,
          vehicleId: null,
          detectedPlate: match.detectedPlate,
          anomalyType,
          description: options.overrideAdminUserId
            ? `Guest admitted via ADMIN override by user '${options.overrideAdminUserId}'.`
            : `Guest admitted to zone '${zone.code}'.`,
          resolved: false,
        },
      });
      if (options.overrideAdminUserId) {
        await tx.notification.create({
          data: {
            zoneId: zone.id,
            type: "GUEST_ADMISSION_ISSUE",
            message: `Guest admitted by admin override under normal policy denial.`,
            targetRole: "ADMIN",
          },
        });
      }

      return this.guestResult(event, {
        admitted: true,
        deniedReason: null,
        anomalyType,
        guestSessionId: session.id,
      });
    }

    // DENIED: occupancy unchanged, recorded as an auditable anomaly.
    await tx.occupancyAnomaly.create({
      data: {
        occupancyEventId: event.id,
        cameraId: camera.id,
        vehicleId: null,
        detectedPlate: match.detectedPlate,
        anomalyType: "GUEST_DENIED",
        description: `Guest ENTRY denied for plate '${match.detectedPlate ?? "unknown"}' (${deniedReason}).`,
        resolved: false,
      },
    });
    await tx.notification.create({
      data: {
        zoneId: zone.id,
        type: "GUEST_ADMISSION_ISSUE",
        message: `Guest entry denied (${deniedReason}).`,
        targetRole: "ADMIN",
      },
    });

    return this.guestResult(event, {
      admitted: false,
      deniedReason,
      anomalyType: "GUEST_DENIED",
      guestSessionId: null,
    });
  }

  /**
   * Maps a recorded OccupancyEvent into the response shape returned to the
   * camera route for a guest-candidate event, and returns the admission result.
   */
  private async guestResult(
    event: {
      id: string;
      zoneId: string;
      eventType: OccupancyEventType;
      previousOccupied: number;
      newOccupied: number;
      availableCount: number;
    },
    admission: GuestAdmissionResult
  ) {
    return { ...event, ...admission };
  }

  /**
   * Decide whether an unknown/low-confidence plate may be admitted as a guest.
  * PRIMARY_ZONE: only the configured primary zone admits; a null primary zone
  * fails safe (deny); a full zone always denies to preserve the occupancy
  * invariant. An explicit ADMIN override bypasses policy-zone checks but not
  * the physical capacity invariant, and is audited when admitted.
   * DENY_WHEN_FULL: admit when space; ALLOW_OVERFLOW: admit regardless.
   */
  private async decideGuestAdmission(
    zone: { id: string; code: string; capacity: number; occupiedCount: number },
    options: ProcessEventOptions
  ): Promise<
    | { admitted: true; adminOverride: boolean; deniedReason: null }
    | { admitted: false; adminOverride: false; deniedReason: string }
  > {
    let policy: GuestPolicyConfig;
    if (this.config) {
      policy = await this.config.getGuestPolicy();
    } else {
      const { DEFAULT_GUEST_POLICY } = await import("@parada/config");
      policy = DEFAULT_GUEST_POLICY;
    }

    // Administrative override bypasses policy configuration and zone selection,
    // but never permits occupiedCount to exceed capacity.
    if (options.overrideAdminUserId) {
      if (zone.occupiedCount >= zone.capacity) {
        return { admitted: false, adminOverride: false, deniedReason: "GUEST_ZONE_FULL" };
      }
      return { admitted: true, adminOverride: true, deniedReason: null };
    }

    if (policy.policy === "PRIMARY_ZONE") {
      if (!policy.primaryZoneId) {
        return { admitted: false, adminOverride: false, deniedReason: "GUEST_POLICY_MISCONFIGURED" };
      }
      if (zone.id !== policy.primaryZoneId) {
        return { admitted: false, adminOverride: false, deniedReason: "NOT_PRIMARY_GUEST_ZONE" };
      }
      if (zone.occupiedCount >= zone.capacity) {
        return { admitted: false, adminOverride: false, deniedReason: "GUEST_ZONE_FULL" };
      }
      return { admitted: true, adminOverride: false, deniedReason: null };
    }

    if (policy.policy === "DENY_WHEN_FULL") {
      if (zone.occupiedCount >= zone.capacity) {
        return { admitted: false, adminOverride: false, deniedReason: "GUEST_ZONE_FULL" };
      }
      return { admitted: true, adminOverride: false, deniedReason: null };
    }

    // ALLOW_OVERFLOW cannot violate the database occupancy invariant. It is
    // therefore admitted only while capacity remains available.
    if (zone.occupiedCount >= zone.capacity) {
      return { admitted: false, adminOverride: false, deniedReason: "GUEST_ZONE_FULL" };
    }
    return { admitted: true, adminOverride: false, deniedReason: null };
  }

  /**
   * Find an ACTIVE (window-valid) reservation for this vehicle/zone and consume
   * it (set to ACTIVE) so it stops protecting extra capacity. Expired/cancelled
   * reservations are left alone and treated as inactive. Returns true if a
   * matching active reservation was honored.
   */
  private async consumeReservationForZone(
    tx: Prisma.TransactionClient,
    match: VehicleMatch,
    zoneId: string,
    now: Date
  ): Promise<boolean> {
    if (!match.vehicleId) {
      return false;
    }
    const vehicle = await tx.vehicle.findUnique({
      where: { id: match.vehicleId },
      select: { userId: true },
    });
    if (!vehicle) {
      return false;
    }
    const active = await tx.reservation.findFirst({
      where: {
        userId: vehicle.userId,
        vehicleId: match.vehicleId,
        zoneId,
        status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
        startAt: { lte: now },
        endAt: { gte: now },
      },
      orderBy: { startAt: "asc" },
    });
    if (active) {
      if (active.status !== "ACTIVE") {
        await tx.reservation.update({
          where: { id: active.id },
          data: { status: "ACTIVE" },
        });
      }
      return true;
    }
    return false;
  }

  /**
   * Generate admin/maintainer notifications on a state TRANSITION, not on every
   * event. A ZONE_FULL notification is created only when the zone first becomes
   * full; a ZONE_LOW_AVAILABILITY notification only when availability first
   * crosses at/below ZONE_OCCUPANCY_LOW_THRESHOLD. Because occupancy only
   * increases via ENTRY, this transition check prevents notification spam while
   * a zone remains in the same state, and a zone that drains and refills is
   * treated as a new transition. [IMPLEMENTATION DECISION]
   */
  private async maybeNotify(
    tx: Prisma.TransactionClient,
    input: {
      zoneId: string;
      capacity: number;
      previousOccupied: number;
      newOccupied: number;
      availableCount: number;
    }
  ): Promise<void> {
    const { zoneId, capacity, previousOccupied, newOccupied, availableCount } = input;

    if (capacity <= 0) {
      return;
    }

    const wasFull = previousOccupied >= capacity;
    const nowFull = newOccupied >= capacity;
    if (!wasFull && nowFull) {
      await tx.notification.create({
        data: {
          zoneId,
          type: "ZONE_FULL",
          message: `Zone is FULL (${capacity}/${capacity} occupied).`,
          targetRole: "ADMIN",
        },
      });
    }

    const availableFraction = availableCount / capacity;
    const previousAvailableFraction = (capacity - previousOccupied) / capacity;
    const nowLow = availableFraction <= ZONE_OCCUPANCY_LOW_THRESHOLD;
    const wasLow = previousAvailableFraction <= ZONE_OCCUPANCY_LOW_THRESHOLD;
    if (!wasLow && nowLow) {
      await tx.notification.create({
        data: {
          zoneId,
          type: "ZONE_LOW_AVAILABILITY",
          message: `Zone availability is low (${availableCount}/${capacity} available).`,
          targetRole: "ADMIN",
        },
      });
    }
  }

  async getZoneOccupancy(zoneId: string) {
    const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundError(`Zone '${zoneId}' not found.`);
    }
    return {
      zoneId: zone.id,
      name: zone.name,
      code: zone.code,
      capacity: zone.capacity,
      occupiedCount: zone.occupiedCount,
      availableCount: zone.capacity - zone.occupiedCount,
      status: zone.status,
    };
  }
}
