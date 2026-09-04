import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { currentUserId } from "../middleware/auth";
import type { AssignmentService } from "../domain/assignment";

export function assignmentsRouter(assignments: AssignmentService): Router {
  const router = Router();

  router.post(
    "/assignments",
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

      const assignment = await assignments.create(userId, { zoneId, vehicleId });
      res.status(201).json(ok(assignment));
    })
  );

  router.get(
    "/assignments",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const list = await assignments.list(userId);
      res.json(ok(list));
    })
  );

  router.get(
    "/assignments/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const assignment = await assignments.get(userId, req.params["id"]!);
      res.json(ok(assignment));
    })
  );

  return router;
}
