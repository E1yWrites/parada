import { Router } from "express";
import { ok } from "../http/response";
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

  return router;
}