import { prisma, type Prisma } from "@parada/database";
import { ConflictError, NotFoundError } from "../http/errors";
import type { ConfigService } from "./config";
import type { ZoneAssignmentResponse } from "@parada/types";

function toResponse(a: {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  status: ZoneAssignmentResponse["status"];
  assignedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  zone: { id: string; name: string; code: string };
  vehicle: { id: string; plateNumber: string; vehicleType: ZoneAssignmentResponse["vehicle"]["vehicleType"] };
}): ZoneAssignmentResponse {
  return {
    id: a.id,
    userId: a.userId,
    vehicleId: a.vehicleId,
    zoneId: a.zoneId,
    status: a.status,
    assignedAt: a.assignedAt.toISOString(),
    expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    zone: a.zone,
    vehicle: a.vehicle,
  };
}

/**
 * Zone-assignment domain operations.
 *
 * An assignment is created ONLY after the user explicitly accepts/selects a
 * zone (a recommendation never auto-assigns). The assignment records the
 * user's intended zone for later wrong-zone detection:
 *
 *   assigned zone  vs  actual parking zone
 *
 * "One active assignment per vehicle" is enforced both here and by the database
 * (partial unique index `zone_assignments_one_active_per_vehicle`, added in
 * migration 20260906120000), so a concurrent check-then-create cannot slip past.
 */
export class AssignmentService {
  private readonly config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
  }

  /** Owned AND registered: an unregistered (INACTIVE) vehicle is not eligible for new parking activity. */
  private async requireOwnedVehicle(userId: string, vehicleId: string) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId, status: "ACTIVE" } });
    if (!vehicle) {
      throw new NotFoundError("Vehicle not found.");
    }
    return vehicle;
  }

  async create(
    userId: string,
    input: { zoneId: string; vehicleId: string }
  ): Promise<ZoneAssignmentResponse> {
    const vehicle = await this.requireOwnedVehicle(userId, input.vehicleId);

    const zone = await prisma.parkingZone.findUnique({ where: { id: input.zoneId } });
    if (!zone || zone.status !== "ACTIVE") {
      throw new NotFoundError(`Zone '${input.zoneId}' not found.`);
    }
    if (zone.capacity <= 0) {
      throw new ConflictError(`Zone '${input.zoneId}' cannot accept assignments.`);
    }

    // Prevent more than one *unexpired* ACTIVE assignment per vehicle. An
    // assignment past its expiry no longer holds the vehicle: it is flipped to
    // EXPIRED here (lazily, mirroring ReservationService.expireOverdue) so the
    // user is never permanently locked out of assigning again.
    await prisma.zoneAssignment.updateMany({
      where: {
        vehicleId: vehicle.id,
        status: "ACTIVE",
        expiresAt: { not: null, lte: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    const active = await prisma.zoneAssignment.findFirst({
      where: { vehicleId: vehicle.id, status: "ACTIVE" },
    });
    if (active) {
      throw new ConflictError("This vehicle already has an active zone assignment.");
    }

    const windowMinutes = await this.config.getReservationWindowMinutes();
    const expiresAt = new Date(Date.now() + windowMinutes * 60 * 1000);

    const assignment = await prisma.zoneAssignment.create({
      data: {
        userId,
        vehicleId: vehicle.id,
        zoneId: zone.id,
        status: "ACTIVE",
        expiresAt,
      },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });

    return toResponse(assignment);
  }

  async list(userId: string): Promise<ZoneAssignmentResponse[]> {
    const rows = await prisma.zoneAssignment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    return rows.map(toResponse);
  }

  async get(userId: string, assignmentId: string): Promise<ZoneAssignmentResponse> {
    const row = await prisma.zoneAssignment.findFirst({
      where: { id: assignmentId, userId },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    if (!row) {
      throw new NotFoundError("Assignment not found.");
    }
    return toResponse(row);
  }

  /**
   * Driver-initiated release of an accepted recommendation. Allowed only
   * while the assignment is ACTIVE, unexpired, owned by the caller, and the
   * vehicle has not entered a zone (no ACTIVE parking session). The row is
   * kept as history with status CANCELLED: nothing about occupancy,
   * reservations or sessions is touched, and the vehicle may be assigned
   * again immediately (the partial unique index only covers ACTIVE rows).
   */
  async cancel(userId: string, assignmentId: string): Promise<ZoneAssignmentResponse> {
    const include = {
      zone: { select: { id: true, name: true, code: true } },
      vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
    } as const;
    const existing = await prisma.zoneAssignment.findFirst({
      where: { id: assignmentId, userId },
      include,
    });
    if (!existing) {
      throw new NotFoundError("Assignment not found.");
    }
    if (existing.status !== "ACTIVE") {
      throw new ConflictError("This assignment is no longer active and cannot be cancelled.");
    }
    if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
      await prisma.zoneAssignment.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });
      throw new ConflictError("This assignment has already expired.");
    }
    const parked = await prisma.parkingSession.findFirst({
      where: { vehicleId: existing.vehicleId, status: "ACTIVE" },
      select: { id: true },
    });
    if (parked) {
      throw new ConflictError(
        "This vehicle has already entered the parking area; the assignment can no longer be cancelled."
      );
    }
    // Guarded update: a concurrent cancel/expiry that flipped the status
    // first wins, so the transition is applied exactly once.
    const flipped = await prisma.zoneAssignment.updateMany({
      where: { id: existing.id, userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    if (flipped.count !== 1) {
      throw new ConflictError("This assignment is no longer active and cannot be cancelled.");
    }
    const updated = await prisma.zoneAssignment.findUniqueOrThrow({ where: { id: existing.id }, include });
    return toResponse(updated);
  }

  /**
   * Returns the active assignment for a vehicle (if any) — used for wrong-zone
   * detection. Scoped to the requesting user; returns null if none.
   *
   * `tx` is passed by callers that are already inside an interactive
   * transaction (the camera occupancy pipeline). Reading through the global
   * client from there would check out a second pooled connection while the
   * first is still held, which deadlocks under concurrency.
   */
  async getActiveForVehicle(
    userId: string,
    vehicleId: string,
    tx: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<ZoneAssignmentResponse | null> {
    const row = await tx.zoneAssignment.findFirst({
      where: { userId, vehicleId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    if (!row) {
      return null;
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      return null;
    }
    return toResponse(row);
  }
}
