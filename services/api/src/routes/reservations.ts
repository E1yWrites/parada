import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { currentUserId } from "../middleware/auth";
import type { ReservationService } from "../domain/reservation";
import type { RealtimeHub } from "../realtime/hub";

export function reservationsRouter(reservations: ReservationService, realtimeHub?: RealtimeHub): Router {
  const router = Router();

  router.post(
    "/reservations",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const body: Record<string, unknown> = req.body ?? {};

      const zoneId = body["zoneId"];
      const vehicleId = body["vehicleId"];

      if (typeof zoneId !== "string" || zoneId.length === 0) {
        throw new BadRequestError("'zoneId' (string) is required.");
      }
      if (typeof vehicleId !== "string" || vehicleId.length === 0) {
        throw new BadRequestError("'vehicleId' (string) is required.");
      }

      const startAt = typeof body["startAt"] === "string" ? body["startAt"] : undefined;
      const endAt = typeof body["endAt"] === "string" ? body["endAt"] : undefined;

      const reservation = await reservations.create(userId, {
        zoneId,
        vehicleId,
        startAt,
        endAt,
      });
      realtimeHub?.publish(
        { type: "RESERVATION_CREATED", occurredAt: new Date().toISOString(), payload: reservation },
        { audience: "USER", userId }
      );
      res.status(201).json(ok(reservation));
    })
  );

  router.get(
    "/reservations",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const list = await reservations.list(userId);
      res.json(ok(list));
    })
  );

  router.get(
    "/reservations/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const reservation = await reservations.get(userId, req.params["id"]!);
      res.json(ok(reservation));
    })
  );

  router.patch(
    "/reservations/:id/cancel",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const reservation = await reservations.cancel(userId, req.params["id"]!);
      realtimeHub?.publish(
        { type: "RESERVATION_CANCELLED", occurredAt: new Date().toISOString(), payload: reservation },
        { audience: "USER", userId }
      );
      res.json(ok(reservation));
    })
  );

  return router;
}
