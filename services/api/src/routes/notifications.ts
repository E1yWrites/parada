import { Router } from "express";
import { prisma } from "@parada/database";
import { ok } from "../http/response";
import { BadRequestError, NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { currentUserId } from "../middleware/auth";

/**
 * A driver's own notifications. Scoped to the authenticated identity, so a
 * user can never read another user's alerts or the ADMIN-targeted operational
 * feed (which lives under /admin/notifications).
 */
export function notificationsRouter(): Router {
  const router = Router();

  router.get(
    "/notifications",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const limitRaw = req.query["limit"];
      let limit = 100;
      if (typeof limitRaw === "string") {
        const parsed = Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
          throw new BadRequestError("'limit' must be an integer between 1 and 500.");
        }
        limit = parsed;
      }
      const unreadOnly = req.query["unread"] === "true" || req.query["unread"] === "1";

      const where = { userId, targetRole: "USER" as const, ...(unreadOnly ? { read: false } : {}) };
      const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            zoneId: true,
            type: true,
            message: true,
            read: true,
            createdAt: true,
            zone: { select: { id: true, name: true, code: true } },
          },
        }),
        prisma.notification.count({ where: { userId, targetRole: "USER", read: false } }),
      ]);

      res.json(ok({ notifications, unreadCount }));
    })
  );

  router.patch(
    "/notifications/:id/read",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      // Scoped update: another user's notification is simply not found.
      const updated = await prisma.notification.updateMany({
        where: { id: req.params["id"]!, userId },
        data: { read: true },
      });
      if (updated.count !== 1) {
        throw new NotFoundError("Notification not found.");
      }
      res.json(ok({ id: req.params["id"], read: true }));
    })
  );

  return router;
}
