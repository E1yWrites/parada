import { prisma, Prisma } from "@parada/database";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../http/errors";
import type { ConfigService } from "./config";
import type { ReservationResponse } from "@parada/types";

function toResponse(res: {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  startAt: Date;
  endAt: Date;
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
  zone: { id: string; name: string; code: string };
  vehicle: { id: string; plateNumber: string; vehicleType: ReservationResponse["vehicle"]["vehicleType"] };
}): ReservationResponse {
  return {
    id: res.id,
    userId: res.userId,
    vehicleId: res.vehicleId,
    zoneId: res.zoneId,
    startAt: res.startAt.toISOString(),
    endAt: res.endAt.toISOString(),
    status: res.status,
    createdAt: res.createdAt.toISOString(),
    updatedAt: res.updatedAt.toISOString(),
    zone: res.zone,
    vehicle: res.vehicle,
  };
}

/**
 * Reservation domain operations.
 *
 * A reservation PROTECTS capacity: an active/confirmed reservation within its
 * arrival window consumes a slot even though `occupiedCount` has not changed.
 * The effective availability invariant is:
 *
 *   occupiedCount + window-valid reservation count < zone capacity
 *
 * Expiration is evaluated lazily (whenever reservations are listed/queried or
 * a reservation is created) using the establishment's configured arrival
 * window — there is no background scheduler.
 */
export class ReservationService {
  private readonly config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
  }

  /**
   * Flip window-expired reservations (PENDING/CONFIRMED/ACTIVE and past their
   * arrival window) to EXPIRED so they no longer protect capacity.
   */
  private async expireOverdue(windowMinutes: number, tx: Prisma.TransactionClient): Promise<void> {
    const now = new Date();
    await tx.reservation.updateMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
        startAt: { lte: new Date(now.getTime() - windowMinutes * 60 * 1000) },
      },
      data: { status: "EXPIRED" },
    });
  }

  /**
   * Count reservations that still protect capacity for a given zone at a point
   * in time. A reservation protects capacity if its status is not
   * EXPIRED/CANCELLED and its arrival window (startAt + window) is still ahead
   * of `now` (i.e. it has not expired).
   */
  private countActiveProtection(
    tx: Prisma.TransactionClient,
    zoneId: string,
    windowMinutes: number,
    now: Date,
    exclude?: { userId: string; vehicleId: string }
  ): Promise<number> {
    return tx.reservation.count({
      where: {
        zoneId,
        status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
        // Bounded on BOTH sides: a reservation only protects capacity around
        // its own arrival window. Without the upper bound a booking weeks out
        // would consume a space today.
        startAt: {
          gte: new Date(now.getTime() - windowMinutes * 60 * 1000),
          lte: new Date(now.getTime() + windowMinutes * 60 * 1000),
        },
        ...(exclude
          ? { NOT: { userId: exclude.userId, vehicleId: exclude.vehicleId } }
          : {}),
      },
    });
  }

  /**
   * How many spaces in this zone are currently held by *other* parties'
   * reservations. Runs in the caller's transaction so an entry path can check
   * it without opening a nested one. `exclude` drops the arriving vehicle's own
   * booking, so a holder is never blocked by their own reservation.
   *
   * Exposed so the entry paths enforce the same invariant this service
   * documents — otherwise walk-ups fill the zone and the holder is turned away.
   */
  async protectingCount(
    tx: Prisma.TransactionClient,
    zoneId: string,
    exclude?: { userId: string; vehicleId: string }
  ): Promise<number> {
    const windowMinutes = await this.config.getReservationWindowMinutes();
    await this.expireOverdue(windowMinutes, tx);
    return this.countActiveProtection(tx, zoneId, windowMinutes, new Date(), exclude);
  }

  private async requireOwnedVehicle(userId: string, vehicleId: string) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId },
    });
    if (!vehicle) {
      throw new NotFoundError("Vehicle not found.");
    }
    return vehicle;
  }

  async create(
    userId: string,
    input: { zoneId: string; vehicleId: string; startAt?: string; endAt?: string }
  ) {
    const windowMinutes = await this.config.getReservationWindowMinutes();

    const vehicle = await this.requireOwnedVehicle(userId, input.vehicleId);

    const zone = await prisma.parkingZone.findUnique({ where: { id: input.zoneId } });
    if (!zone || zone.status !== "ACTIVE") {
      throw new NotFoundError(`Zone '${input.zoneId}' not found.`);
    }

    const now = new Date();
    // A reservation is for a future arrival. Default: assume the user wants to
    // arrive "now" (startAt = now), lasting up to the configured window.
    const startAt = input.startAt ? new Date(input.startAt) : now;
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestError("'startAt' must be a valid date.");
    }
    const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + windowMinutes * 60 * 1000);
    if (Number.isNaN(endAt.getTime())) {
      throw new BadRequestError("'endAt' must be a valid date.");
    }

    if (endAt <= startAt) {
      throw new BadRequestError("'endAt' must be after 'startAt'.");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Expire overdue reservations first so stale ones stop protecting capacity.
        await this.expireOverdue(windowMinutes, tx);

        const protecting = await this.countActiveProtection(tx, zone.id, windowMinutes, now);
        if (zone.occupiedCount + protecting >= zone.capacity) {
          throw new ConflictError(`Zone '${zone.id}' has no available reservation capacity.`, {
            occupiedCount: zone.occupiedCount,
            reservedCount: protecting,
            capacity: zone.capacity,
          });
        }

        const reservation = await tx.reservation.create({
          data: {
            userId,
            vehicleId: vehicle.id,
            zoneId: zone.id,
            startAt,
            endAt,
            status: "CONFIRMED",
          },
          include: {
            zone: { select: { id: true, name: true, code: true } },
            vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          },
        });

        return toResponse(reservation);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestError("Could not create reservation.");
      }
      throw err;
    }
  }

  async list(userId: string): Promise<ReservationResponse[]> {
    const windowMinutes = await this.config.getReservationWindowMinutes();
    await prisma.$transaction(async (tx) => {
      await this.expireOverdue(windowMinutes, tx);
    });
    const rows = await prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    return rows.map(toResponse);
  }

  async get(userId: string, reservationId: string): Promise<ReservationResponse> {
    const row = await prisma.reservation.findFirst({
      where: { id: reservationId, userId },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    if (!row) {
      throw new NotFoundError("Reservation not found.");
    }
    return toResponse(row);
  }

  async cancel(userId: string, reservationId: string): Promise<ReservationResponse> {
    const existing = await prisma.reservation.findFirst({
      where: { id: reservationId, userId },
    });
    if (!existing) {
      throw new NotFoundError("Reservation not found.");
    }
    if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
      throw new ForbiddenError("This reservation can no longer be cancelled.");
    }

    const updated = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    return toResponse(updated);
  }

  async adminList(): Promise<(ReservationResponse & { user: { id: string; name: string; email: string } })[]> {
    const windowMinutes = await this.config.getReservationWindowMinutes();
    await prisma.$transaction(async (tx) => this.expireOverdue(windowMinutes, tx));
    const rows = await prisma.reservation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    return rows.map((row) => ({ ...toResponse(row), user: row.user }));
  }

  async adminCancel(reservationId: string): Promise<ReservationResponse & { user: { id: string; name: string; email: string } }> {
    const existing = await prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!existing) throw new NotFoundError("Reservation not found.");
    if (existing.status === "CANCELLED" || existing.status === "EXPIRED" || existing.status === "ACTIVE") {
      throw new ForbiddenError("This reservation can no longer be cancelled.");
    }
    const updated = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });
    return { ...toResponse(updated), user: updated.user };
  }
}
