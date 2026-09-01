import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError, NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { prisma } from "@parada/database";
import { requireRole } from "../middleware/auth";

export function adminRouter(): Router {
  const router = Router();

  router.use(requireRole("ADMIN"));

  router.get(
    "/admin/sessions",
    asyncHandler(async (req, res) => {
      const sessions = await prisma.parkingSession.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          zone: { select: { id: true, name: true, code: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          entryEvent: { select: { id: true, detectedAt: true } },
          exitEvent: { select: { id: true, detectedAt: true } },
        },
        orderBy: { enteredAt: "desc" },
      });
      res.json(ok(sessions));
    })
  );

  router.get(
    "/admin/users",
    asyncHandler(async (req, res) => {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          _count: { select: { vehicles: true, sessions: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(ok(users));
    })
  );

  router.get(
    "/admin/zones/:zoneId/history",
    asyncHandler(async (req, res) => {
      const zoneId = req.params["zoneId"]!;

      const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new NotFoundError(`Zone '${zoneId}' not found.`);
      }

      const fromParam = req.query["from"];
      const toParam = req.query["to"];
      let from: Date | undefined;
      let to: Date | undefined;

      if (typeof fromParam === "string") {
        from = new Date(fromParam);
        if (Number.isNaN(from.getTime())) {
          throw new BadRequestError("'from' must be a valid ISO date.");
        }
      }
      if (typeof toParam === "string") {
        to = new Date(toParam);
        if (Number.isNaN(to.getTime())) {
          throw new BadRequestError("'to' must be a valid ISO date.");
        }
      }

      const limitRaw = req.query["limit"];
      let limit = 100;
      if (typeof limitRaw === "string") {
        const parsed = Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
          throw new BadRequestError("'limit' must be an integer between 1 and 1000.");
        }
        limit = parsed;
      }

      const history = await prisma.occupancyHistory.findMany({
        where: { zoneId, occurredAt: { gte: from, lte: to } },
        orderBy: { occurredAt: "asc" },
        take: limit,
        select: { id: true, occurredAt: true, occupiedCount: true, availableCount: true },
      });

      res.json(
        ok({
          zone: {
            id: zone.id,
            name: zone.name,
            code: zone.code,
            capacity: zone.capacity,
          },
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
          limit,
          entries: history,
        })
      );
    })
  );

  return router;
}