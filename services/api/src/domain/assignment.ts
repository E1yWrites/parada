import { prisma } from "@parada/database";
import { BadRequestError, ConflictError, NotFoundError } from "../http/errors";
import type { ConfigService } from "./config";
import type { ZoneAssignmentResponse } from "@parada/types";

function toResponse(a: {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
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
 * "One active assignment per vehicle" is enforced here (application-level), as
 * the schema provides no unique constraint for it.
 */
export class AssignmentService {
  private readonly config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
  }

  private async requireOwnedVehicle(userId: string, vehicleId: string) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId } });
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

  /** Returns the active assignment for a vehicle (if any) — used for wrong-zone
   *  detection. Scoped to the requesting user; returns null if none. */
  async getActiveForVehicle(userId: string, vehicleId: string): Promise<ZoneAssignmentResponse | null> {
    const row = await prisma.zoneAssignment.findFirst({
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
