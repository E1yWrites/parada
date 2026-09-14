import { Router } from "express";
import { ok } from "../http/response";
import { asyncHandler } from "../http/asyncHandler";
import { currentUserId } from "../middleware/auth";
import { VehicleService } from "../domain/vehicles";
import type { VehicleCreateInput, VehicleUpdateInput } from "@parada/types";

export function vehiclesRouter(vehicles: VehicleService = new VehicleService()): Router {
  const router = Router();

  router.get(
    "/vehicles",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      res.json(ok(await vehicles.list(userId)));
    })
  );

  router.post(
    "/vehicles",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const body: Record<string, unknown> = req.body ?? {};
      // Only these fields are read; a client-supplied userId is ignored.
      const input = {
        plateNumber: body["plateNumber"],
        vehicleType: body["vehicleType"],
        make: body["make"],
        model: body["model"],
        color: body["color"],
      } as VehicleCreateInput;
      const vehicle = await vehicles.create(userId, input);
      res.status(201).json(ok(vehicle));
    })
  );

  router.get(
    "/vehicles/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      res.json(ok(await vehicles.get(userId, req.params["id"]!)));
    })
  );

  router.patch(
    "/vehicles/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const body: Record<string, unknown> = req.body ?? {};
      const input: VehicleUpdateInput = {};
      if (body["plateNumber"] !== undefined) input.plateNumber = body["plateNumber"] as string;
      if (body["vehicleType"] !== undefined) input.vehicleType = body["vehicleType"] as VehicleUpdateInput["vehicleType"];
      if (body["make"] !== undefined) input.make = body["make"] as string | null;
      if (body["model"] !== undefined) input.model = body["model"] as string | null;
      if (body["color"] !== undefined) input.color = body["color"] as string | null;
      res.json(ok(await vehicles.update(userId, req.params["id"]!, input)));
    })
  );

  // Unregister = deactivate. Nothing is deleted; history stays intact.
  router.delete(
    "/vehicles/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      res.json(ok(await vehicles.deactivate(userId, req.params["id"]!)));
    })
  );

  return router;
}
