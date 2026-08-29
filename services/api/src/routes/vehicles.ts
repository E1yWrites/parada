import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError, NotFoundError, UnprocessableError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { prisma } from "@parada/database";
import { normalizePlate } from "@parada/database";
import { currentUserId } from "../middleware/auth";

export function vehiclesRouter(): Router {
  const router = Router();

  router.get(
    "/vehicles",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const vehicles = await prisma.vehicle.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      res.json(ok(vehicles));
    })
  );

  router.post(
    "/vehicles",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const body: Record<string, unknown> = req.body ?? {};
      const plateNumber = body["plateNumber"];
      const vehicleType = body["vehicleType"];

      if (typeof plateNumber !== "string" || plateNumber.trim().length === 0) {
        throw new BadRequestError("'plateNumber' (string) is required.");
      }
      if (typeof vehicleType !== "string") {
        throw new BadRequestError("'vehicleType' (string) is required.");
      }

      const validTypes = ["CAR", "MOTORCYCLE", "VAN", "TRUCK", "OTHER"];
      if (!validTypes.includes(vehicleType)) {
        throw new BadRequestError(`'vehicleType' must be one of: ${validTypes.join(", ")}.`);
      }

      const normalized = normalizePlate(plateNumber);
      const existing = await prisma.vehicle.findUnique({
        where: { userId_normalizedPlate: { userId, normalizedPlate: normalized } },
      });
      if (existing) {
        throw new UnprocessableError("You already have a vehicle with this plate number.");
      }

      const vehicle = await prisma.vehicle.create({
        data: {
          userId,
          plateNumber: plateNumber.trim().toUpperCase(),
          normalizedPlate: normalized,
          vehicleType: vehicleType as "CAR" | "MOTORCYCLE" | "VAN" | "TRUCK" | "OTHER",
          status: "ACTIVE",
        },
      });

      res.status(201).json(ok(vehicle));
    })
  );

  router.get(
    "/vehicles/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: req.params["id"]!, userId, status: "ACTIVE" },
      });
      if (!vehicle) {
        throw new NotFoundError("Vehicle not found.");
      }
      res.json(ok(vehicle));
    })
  );

  return router;
}