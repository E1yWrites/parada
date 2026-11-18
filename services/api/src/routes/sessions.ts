import { Router } from "express";
import { ok } from "../http/response";
import { NotFoundError, BadRequestError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { prisma } from "@parada/database";
import { currentUserId } from "../middleware/auth";
import { sessionInclude, sessionResponse, type ParkingSessionService } from "../domain/sessions";
import type { RealtimeHub } from "../realtime/hub";
import { notificationCreatedPayload, publishZoneSnapshot } from "../realtime/occupancyEvents";

export function sessionsRouter(sessionService?: ParkingSessionService, realtimeHub?: RealtimeHub): Router {
  const router = Router();

  router.get(
    "/sessions",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const sessions = await prisma.parkingSession.findMany({
        where: { userId },
        include: sessionInclude,
        orderBy: { enteredAt: "desc" },
      });
      res.json(ok(sessions.map(sessionResponse)));
    })
  );

  router.get(
    "/sessions/active",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const session = await prisma.parkingSession.findFirst({
        where: { userId, status: "ACTIVE" },
        include: sessionInclude,
      });
      if (!session) {
        res.json(ok(null));
        return;
      }
      res.json(ok(sessionResponse(session)));
    })
  );

  router.get(
    "/sessions/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const session = await prisma.parkingSession.findFirst({
        where: { id: req.params["id"]!, userId },
        include: sessionInclude,
      });
      if (!session) {
        throw new NotFoundError("Session not found.");
      }
      res.json(ok(sessionResponse(session)));
    })
  );

  router.post(
    "/sessions/entry",
    asyncHandler(async (req, res) => {
      if (!sessionService) {
        throw new BadRequestError("Session entry is not configured.");
      }
      const userId = currentUserId(res);
      const body: Record<string, unknown> = req.body ?? {};

      const vehicleId = body["vehicleId"];
      const zoneId = body["zoneId"];

      if (typeof vehicleId !== "string" || vehicleId.length === 0) {
        throw new BadRequestError("'vehicleId' (string) is required.");
      }
      if (typeof zoneId !== "string" || zoneId.length === 0) {
        throw new BadRequestError("'zoneId' (string) is required.");
      }

      const session = await sessionService.entry(userId, { vehicleId, zoneId });
      const occurredAt = new Date().toISOString();
      realtimeHub?.publish(
        { type: "PARKING_SESSION_STARTED", occurredAt, payload: session },
        { audience: "USER", userId }
      );
      // Entering takes a space, so the zone snapshot every client renders moved.
      if (realtimeHub) await publishZoneSnapshot(realtimeHub, session.zoneId, undefined, occurredAt);
      res.status(201).json(ok({ session }));
    })
  );

  router.post(
    "/sessions/:id/exit",
    asyncHandler(async (req, res) => {
      if (!sessionService) {
        throw new BadRequestError("Session exit is not configured.");
      }
      const userId = currentUserId(res);
      const { notification, ...result } = await sessionService.exit(userId, req.params["id"]!);
      const occurredAt = new Date().toISOString();
      realtimeHub?.publish(
        { type: "PARKING_SESSION_COMPLETED", occurredAt, payload: result.session },
        { audience: "USER", userId }
      );
      if (notification) {
        realtimeHub?.publish(
          {
            type: "NOTIFICATION_CREATED",
            occurredAt,
            payload: notificationCreatedPayload(notification),
          },
          { audience: "USER", userId }
        );
      }
      // Exiting frees a space, so the zone snapshot every client renders moved.
      if (realtimeHub) await publishZoneSnapshot(realtimeHub, result.session.zoneId, undefined, occurredAt);
      res.json(ok(result));
    })
  );

  return router;
}