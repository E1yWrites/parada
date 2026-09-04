import { Router } from "express";
import { ok } from "../http/response";
import { NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { prisma } from "@parada/database";
import type { ParkingSessionResponse } from "@parada/types";
import { currentUserId } from "../middleware/auth";

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

export function sessionsRouter(): Router {
  const router = Router();

  router.get(
    "/sessions",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const sessions = await prisma.parkingSession.findMany({
        where: { userId },
        include: {
          zone: { select: { id: true, name: true, code: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          entryEvent: { select: { id: true, detectedAt: true } },
          exitEvent: { select: { id: true, detectedAt: true } },
        },
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
        include: {
          zone: { select: { id: true, name: true, code: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          entryEvent: { select: { id: true, detectedAt: true } },
          exitEvent: { select: { id: true, detectedAt: true } },
        },
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
        include: {
          zone: { select: { id: true, name: true, code: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          entryEvent: { select: { id: true, detectedAt: true } },
          exitEvent: { select: { id: true, detectedAt: true } },
        },
      });
      if (!session) {
        throw new NotFoundError("Session not found.");
      }
      res.json(ok(sessionResponse(session)));
    })
  );

  return router;
}