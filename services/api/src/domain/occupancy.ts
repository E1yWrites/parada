import { Prisma, prisma } from "@parada/database";
import { normalizePlate } from "@parada/database";
import { BadRequestError, ConflictError, NotFoundError } from "../http/errors";
import type {
  OccupancyEventType,
  OccupancySource,
} from "@parada/database";

export interface CameraInput {
  cameraIdentifier: string;
  sourceEventId: string;
  eventType: OccupancyEventType;
  detectedPlate?: string | null;
  ocrConfidence?: number | null;
  detectedAt?: string | null;
}

export interface OccupancyInput extends CameraInput {
  zoneId: string;
}

export interface VehicleMatch {
  vehicleId: string | null;
  detectedPlate: string | null;
  normalizedPlate: string | null;
  ocrConfidence: number | null;
  plateMatched: boolean;
}

export class OccupancyService {
  /**
   * Resolve plate signals into a (possibly null) registered-vehicle match.
   * A match is only established when exactly one registered vehicle owns the
   * normalized plate. Unknown or ambiguous (multiple-owner) plates yield no
   * match -> the event is recorded but no session is created. [IMPLEMENTATION DECISION]
   */
  private async matchVehicle(detectedPlate: string | null): Promise<VehicleMatch> {
    if (!detectedPlate) {
      return {
        vehicleId: null,
        detectedPlate: null,
        normalizedPlate: null,
        ocrConfidence: null,
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
        ocrConfidence: null,
        plateMatched: true,
      };
    }
    return {
      vehicleId: null,
      detectedPlate,
      normalizedPlate: normalized,
      ocrConfidence: null,
      plateMatched: false,
    };
  }

  /**
   * The single write-point for an occupancy change. Runs in one transaction:
   * resolve camera -> bounds-check -> update zone -> insert event + history ->
   * create/close the vehicle session. Returns the created OccupancyEvent.
   */
  async processEvent(input: OccupancyInput, source: OccupancySource = "CAMERA") {
    const { zoneId, cameraIdentifier, sourceEventId, eventType } = input;

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

    const match = await this.matchVehicle(input.detectedPlate ?? null);

    const detectedAt = input.detectedAt ? new Date(input.detectedAt) : new Date();

    try {
      return await prisma.$transaction(async (tx) => {
        const previousOccupied = zone.occupiedCount;

        let newOccupied = previousOccupied;
        if (eventType === "ENTRY") {
          if (previousOccupied >= zone.capacity) {
            throw new ConflictError(`Zone '${zone.id}' is already full.`, {
              capacity: zone.capacity,
              occupiedCount: previousOccupied,
            });
          }
          newOccupied = previousOccupied + 1;
        } else if (eventType === "EXIT") {
          if (previousOccupied <= 0) {
            throw new ConflictError(`Zone '${zone.id}' has no occupancy to release.`, {
              occupiedCount: previousOccupied,
            });
          }
          newOccupied = previousOccupied - 1;
        } else {
          throw new BadRequestError(`Unsupported event type: '${String(eventType)}'.`);
        }

        const availableCount = zone.capacity - newOccupied;

        await tx.parkingZone.update({
          where: { id: zone.id },
          data: { occupiedCount: newOccupied },
        });

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
            vehicleId: match.vehicleId,
            detectedPlate: match.detectedPlate,
            normalizedPlate: match.normalizedPlate,
            ocrConfidence: input.ocrConfidence ?? match.ocrConfidence,
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

        if (match.vehicleId) {
          if (eventType === "ENTRY") {
            const vehicle = await tx.vehicle.findUniqueOrThrow({
              where: { id: match.vehicleId },
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
          } else if (eventType === "EXIT") {
            const existing = await tx.parkingSession.findFirst({
              where: { vehicleId: match.vehicleId, status: "ACTIVE" },
              orderBy: { enteredAt: "asc" },
            });
            if (existing) {
              const durationSeconds = Math.max(
                0,
                Math.floor((detectedAt.getTime() - existing.enteredAt.getTime()) / 1000)
              );
              await tx.parkingSession.update({
                where: { id: existing.id },
                data: {
                  exitEventId: event.id,
                  exitedAt: detectedAt,
                  durationSeconds,
                  status: "COMPLETED",
                },
              });
            }
          }
        }

        return event;
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
