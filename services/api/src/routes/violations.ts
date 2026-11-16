import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { currentUserId } from "../middleware/auth";
import type { ViolationService } from "../domain/violations";
import type { RealtimeHub } from "../realtime/hub";
import { notificationCreatedPayload, publishViolationUpdated } from "../realtime/occupancyEvents";

/** A driver's own violations and their right to dispute them. */
export function violationsRouter(violations: ViolationService, realtimeHub?: RealtimeHub): Router {
  const router = Router();

  router.get(
    "/violations",
    asyncHandler(async (_req, res) => {
      res.json(ok(await violations.listForUser(currentUserId(res))));
    })
  );

  router.post(
    "/violations/:id/appeal",
    asyncHandler(async (req, res) => {
      const reason = (req.body ?? {})["reason"];
      if (typeof reason !== "string" || reason.trim().length === 0) {
        throw new BadRequestError("'reason' (string) is required.");
      }
      const { appeal, notification } = await violations.appeal(
        currentUserId(res),
        req.params["id"]!,
        reason.trim()
      );
      realtimeHub?.publish(
        {
          type: "NOTIFICATION_CREATED",
          occurredAt: new Date().toISOString(),
          payload: notificationCreatedPayload(notification),
        },
        { audience: "ADMIN" }
      );
      if (realtimeHub) await publishViolationUpdated(realtimeHub, appeal.violationId);
      res.status(201).json(ok(appeal));
    })
  );

  return router;
}
