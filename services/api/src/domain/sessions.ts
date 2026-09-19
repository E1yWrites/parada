import { prisma, Prisma, type Notification } from "@parada/database";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../http/errors";
import type { ConfigService } from "./config";
import type { AssignmentService } from "./assignment";
import type { ReservationService } from "./reservation";
import { calculateParkingFee, persistSessionFee } from "./fees";
import type {
  ParkingSessionResponse,
  SessionEntryInput,
  SessionExitInput,
  SessionExitResult,
} from "@parada/types";

type SessionRecord = {
  id: string;
  zoneId: string;
  userId: string;
  vehicleId: string;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: Date;
  exitedAt: Date | null;
  durationSeconds: number | null;
  feeAmount: number | null;
  status: "ACTIVE" | "COMPLETED";
  zone: ParkingSessionResponse["zone"];
  vehicle: ParkingSessionResponse["vehicle"];
  entryEvent: { id: string; detectedAt: Date } | null;
  exitEvent: { id: string; detectedAt: Date } | null;
};

function sessionResponse(session: SessionRecord): ParkingSessionResponse {
  return {
    ...session,
    enteredAt: session.enteredAt.toISOString(),
    exitedAt: session.exitedAt?.toISOString() ?? null,
    entryEvent: session.entryEvent
      ? { ...session.entryEvent, detectedAt: session.entryEvent.detectedAt.toISOString() }
      : null,
    exitEvent: session.exitEvent
      ? { ...session.exitEvent, detectedAt: session.exitEvent.detectedAt.toISOString() }
      : null,
  };
}

const sessionInclude = {
  zone: { select: { id: true, name: true, code: true } },
  vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
  entryEvent: { select: { id: true, detectedAt: true } },
  exitEvent: { select: { id: true, detectedAt: true } },
} as const;

/**
 * User-initiated parking-session operations (entry/exit).
 *
 * Unlike the camera/vision pipeline (`OccupancyService.processEvent`), these
 * operations are invoked by an authenticated user and therefore:
 *   - validate vehicle OWNERSHIP server-side (never trust a client userId)
 *   - record occupancy events with `source = MANUAL` and no camera
 *   - compute and persist the parking fee on exit
 *
 * All related state changes (occupancy, event, history, session) are performed
 * in a single transaction.
 */
export class ParkingSessionService {
  private readonly config: ConfigService;
  private readonly assignments: AssignmentService;
  private readonly reservations?: ReservationService;

  constructor(config: ConfigService, assignments: AssignmentService, reservations?: ReservationService) {
    this.config = config;
    this.assignments = assignments;
    this.reservations = reservations;
  }

  /** Owned AND registered: an unregistered (INACTIVE) vehicle is not eligible for new parking activity. */
  private async requireOwnedVehicle(userId: string, vehicleId: string) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId, status: "ACTIVE" } });
    if (!vehicle) {
      throw new NotFoundError("Vehicle not found.");
    }
    return vehicle;
  }

  async entry(userId: string, input: SessionEntryInput): Promise<ParkingSessionResponse> {
    const vehicle = await this.requireOwnedVehicle(userId, input.vehicleId);

    const zone = await prisma.parkingZone.findUnique({ where: { id: input.zoneId } });
    if (!zone || zone.status !== "ACTIVE") {
      throw new NotFoundError(`Zone '${input.zoneId}' not found.`);
    }
    if (zone.capacity <= 0) {
      throw new ConflictError(`Zone '${input.zoneId}' is not accepting parking.`);
    }

    // Wrong-zone foundation: if the vehicle has an active assignment, the
    // vehicle must enter its assigned zone. A mismatch surfaces as a domain
    // condition (the full violation lifecycle belongs to a later phase).
    const activeAssignment = await this.assignments.getActiveForVehicle(userId, vehicle.id);
    if (activeAssignment && activeAssignment.zoneId !== zone.id) {
      throw new ConflictError(
        `Vehicle is assigned to zone '${activeAssignment.zone.code}' but attempting to enter zone '${zone.code}'.`,
        { assignedZone: activeAssignment.zoneId, actualZone: zone.id }
      );
    }

    const enteredAt = input.enteredAt ? new Date(input.enteredAt) : new Date();
    if (Number.isNaN(enteredAt.getTime())) {
      throw new BadRequestError("'enteredAt' must be a valid date.");
    }

    try {
      const session = await prisma.$transaction(async (tx) => {
        // Duplicate active session check + atomic capacity guard.
        const activeForVehicle = await tx.parkingSession.findFirst({
          where: { vehicleId: vehicle.id, status: "ACTIVE" },
        });
        if (activeForVehicle) {
          throw new ConflictError("This vehicle already has an active parking session.");
        }

        // A reservation protects a space even though occupiedCount has not
        // moved, so a walk-up must not consume the last reserved one.
        if (this.reservations) {
          const held = await this.reservations.protectingCount(tx, zone.id, {
            userId,
            vehicleId: vehicle.id,
          });
          const zoneNow = await tx.parkingZone.findUniqueOrThrow({
            where: { id: zone.id },
            select: { capacity: true, occupiedCount: true },
          });
          if (zoneNow.occupiedCount + held >= zoneNow.capacity) {
            throw new ConflictError(`Zone '${zone.id}' is full.`, {
              reservedCount: held,
              capacity: zoneNow.capacity,
            });
          }
        }

        // Atomic increment: only succeeds if the zone still has capacity, which
        // prevents two simultaneous entries from over-filling the zone.
        const updatedZone = await tx.parkingZone.updateMany({
          where: { id: zone.id, occupiedCount: { lt: zone.capacity } },
          data: { occupiedCount: { increment: 1 } },
        });
        if (updatedZone.count !== 1) {
          throw new ConflictError(`Zone '${zone.id}' is full.`);
        }

        // A successful entry consumes the driver's own in-window reservation
        // for this zone (same rule as the camera pipeline), so it stops
        // protecting a space the vehicle now physically occupies.
        if (this.reservations) {
          await this.reservations.consumeForEntry(
            tx,
            { userId, vehicleId: vehicle.id, zoneId: zone.id },
            enteredAt
          );
        }

        // Read back the real post-increment state rather than reusing the
        // pre-transaction snapshot, which is stale under concurrent entries.
        const zoneAfter = await tx.parkingZone.findUniqueOrThrow({
          where: { id: zone.id },
          select: { capacity: true, occupiedCount: true },
        });
        const newOccupied = zoneAfter.occupiedCount;
        const availableCount = zoneAfter.capacity - newOccupied;

        const event = await tx.occupancyEvent.create({
          data: {
            zoneId: zone.id,
            cameraId: null,
            eventType: "ENTRY",
            previousOccupied: newOccupied - 1,
            newOccupied,
            availableCount,
            source: "MANUAL",
            vehicleId: vehicle.id,
            detectedAt: enteredAt,
          },
        });

        await tx.occupancyHistory.create({
          data: {
            zoneId: zone.id,
            occupiedCount: newOccupied,
            availableCount,
            occurredAt: enteredAt,
          },
        });

        const created = await tx.parkingSession.create({
          data: {
            zoneId: zone.id,
            userId,
            vehicleId: vehicle.id,
            entryEventId: event.id,
            enteredAt,
            status: "ACTIVE",
          },
          include: sessionInclude,
        });

        return created;
      });

      return sessionResponse((session as unknown) as SessionRecord);
    } catch (err) {
      if (err instanceof ConflictError) {
        throw err;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("This vehicle already has an active parking session.");
      }
      throw err;
    }
  }

  async exit(
    userId: string,
    sessionId: string,
    input: SessionExitInput = {}
  ): Promise<SessionExitResult & { notification: Notification | null }> {
    const session = await prisma.parkingSession.findFirst({
      where: { id: sessionId, userId },
      include: sessionInclude,
    });
    if (!session) {
      throw new NotFoundError("Session not found.");
    }
    if (session.status !== "ACTIVE") {
      throw new ConflictError("This session is not active and cannot be exited.");
    }

    const exitedAt = input.exitedAt ? new Date(input.exitedAt) : new Date();
    if (Number.isNaN(exitedAt.getTime())) {
      throw new BadRequestError("'exitedAt' must be a valid date.");
    }

    const durationMs = Math.max(0, exitedAt.getTime() - session.enteredAt.getTime());
    const durationSeconds = Math.floor(durationMs / 1000);

    const feeConfig = await this.config.getParkingFeeConfig();
    const fee = calculateParkingFee(durationMs, feeConfig);

    // Two concurrent exits for the SAME session both pass the status check
    // above. The unique constraint on `ParkingFee.sessionId` stops the second
    // one: it aborts the whole transaction, so the double decrement of
    // `occupiedCount` is rolled back and occupancy stays correct. That is a
    // domain conflict (409), not the 500 a raw Prisma error produced.
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Atomic decrement: never allow occupiedCount below 0.
        const updatedZone = await tx.parkingZone.updateMany({
          where: { id: session.zoneId, occupiedCount: { gt: 0 } },
          data: { occupiedCount: { decrement: 1 } },
        });
        if (updatedZone.count !== 1) {
          throw new ConflictError(`Zone '${session.zoneId}' has no occupancy to release.`);
        }

        // Read back the real post-decrement state; OccupancyHistory is the audit
        // trail and must never carry invented counts.
        const zoneAfter = await tx.parkingZone.findUniqueOrThrow({
          where: { id: session.zoneId },
          select: { capacity: true, occupiedCount: true },
        });
        const newOccupied = zoneAfter.occupiedCount;
        const availableCount = zoneAfter.capacity - newOccupied;

        const event = await tx.occupancyEvent.create({
          data: {
            zoneId: session.zoneId,
            cameraId: null,
            eventType: "EXIT",
            previousOccupied: newOccupied + 1,
            newOccupied,
            availableCount,
            source: "MANUAL",
            vehicleId: session.vehicleId,
            detectedAt: exitedAt,
          },
        });

        await tx.occupancyHistory.create({
          data: {
            zoneId: session.zoneId,
            occupiedCount: newOccupied,
            availableCount,
            occurredAt: exitedAt,
          },
        });

        const updated = await tx.parkingSession.update({
          where: { id: session.id },
          data: {
            exitEventId: event.id,
            exitedAt,
            durationSeconds,
            feeAmount: fee.amount,
            status: "COMPLETED",
          },
          include: sessionInclude,
        });

        const { row: feeRow, notification } = await persistSessionFee(tx, {
          sessionId: session.id,
          zoneId: session.zoneId,
          userId,
          durationMs,
          feeConfig,
        });

        return { updated, feeRow, notification };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("This session has already been exited.");
      }
      throw err;
    }

    return {
      session: sessionResponse((result.updated as unknown) as SessionRecord),
      fee: {
        id: result.feeRow.id,
        amount: result.feeRow.amount,
        status: result.feeRow.status,
        rateBreakdown: result.feeRow.rateBreakdown,
      },
      // Committed alongside the fee; the route publishes it and keeps it out of
      // the response body, which stays the shared SessionExitResult shape.
      notification: result.notification,
    };
  }
}
