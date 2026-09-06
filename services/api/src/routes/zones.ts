import { Router } from "express";
import { ok } from "../http/response";
import { NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { OccupancyService } from "../domain/occupancy";
import { ZoneService } from "../domain/zones";
import { ConfigService } from "../domain/config";
import { availabilityOf } from "./admin";

export function zonesRouter(
  occupancy: OccupancyService,
  zones: ZoneService = new ZoneService(),
  config: ConfigService = new ConfigService()
): Router {
  const router = Router();

  router.get(
    "/zones",
    asyncHandler(async (_req, res) => {
      const zonesList = await zones.list();
      res.json(ok(zonesList));
    })
  );

  /**
   * Establishment-level navigation destination (Phase 9.5). Zones carry no
   * coordinates, so the parking establishment is the navigation target. The
   * location is admin-configurable and `null` until one is provided — the API
   * never fabricates coordinates for the client.
   */
  router.get(
    "/zones/establishment",
    asyncHandler(async (_req, res) => {
      const settings = await config.getEstablishmentSettings();
      res.json(ok({ location: settings.location }));
    })
  );

  router.get(
    "/zones/recommendation",
    asyncHandler(async (_req, res) => {
      const recommendation = await zones.recommend();
      res.json(ok(recommendation));
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
