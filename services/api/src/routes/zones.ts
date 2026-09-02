import { Router } from "express";
import { prisma } from "@parada/database";
import { ok } from "../http/response";
import { NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { OccupancyService } from "../domain/occupancy";
import { availabilityOf } from "./admin";

export function zonesRouter(occupancy: OccupancyService): Router {
  const router = Router();

  router.get(
    "/zones",
    asyncHandler(async (_req, res) => {
      const zones = await prisma.parkingZone.findMany({
        where: { status: "ACTIVE" },
        orderBy: { code: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          capacity: true,
          occupiedCount: true,
          status: true,
        },
      });
      res.json(
        ok(
          zones.map((z) => ({
            id: z.id,
            name: z.name,
            code: z.code,
            capacity: z.capacity,
            occupiedCount: z.occupiedCount,
            availableCount: z.capacity - z.occupiedCount,
            status: z.status,
            availability: availabilityOf(z.occupiedCount, z.capacity, z.status),
          }))
        )
      );
    })
  );

  router.get(
    "/zones/:zoneId/occupancy",
    asyncHandler(async (req, res) => {
      const payload = await occupancy.getZoneOccupancy(req.params["zoneId"]!);
      if (!payload) {
        throw new NotFoundError(`Zone '${req.params["zoneId"]}' not found.`);
      }
      res.json(
        ok({
          ...payload,
          availability: availabilityOf(payload.occupiedCount, payload.capacity, payload.status),
        })
      );
    })
  );

  return router;
}
