import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { requireRole } from "../middleware/auth";
import { SimulatorService, SIMULATOR_SCENARIOS, type SimulatorScenario } from "../domain/simulator";
import { publishZoneSnapshot } from "../realtime/occupancyEvents";
import type { RealtimeHub } from "../realtime/hub";

/**
 * Simulator control plane — ADMIN ONLY. A USER must never be able to
 * artificially change parking occupancy, so every route here requires
 * authentication + the ADMIN role (route-level requireRole("ADMIN")).
 */
export function simulatorRouter(simulator: SimulatorService, realtimeHub?: RealtimeHub): Router {
  const router = Router();

  router.use(requireRole("ADMIN"));

  router.get(
    "/simulator/status",
    asyncHandler(async (_req, res) => {
      res.json(ok(simulator.getStatus()));
    })
  );

  router.post(
    "/simulator/run",
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const scenario = body["scenario"];
      if (typeof scenario !== "string" || !SIMULATOR_SCENARIOS.includes(scenario as SimulatorScenario)) {
        throw new BadRequestError(
          `'scenario' must be one of: ${SIMULATOR_SCENARIOS.join(", ")}.`
        );
      }

      const zoneId = body["zoneId"];
      const vehicleIds = body["vehicleIds"];
      const unknownPlate = body["unknownPlate"];
      const fillTo = body["fillTo"];

      const result = await simulator.runScenario({
        scenario: scenario as SimulatorScenario,
        zoneId: typeof zoneId === "string" ? zoneId : undefined,
        vehicleIds: Array.isArray(vehicleIds) ? (vehicleIds as string[]) : undefined,
        unknownPlate: typeof unknownPlate === "string" ? unknownPlate : undefined,
        fillTo: typeof fillTo === "number" ? fillTo : undefined,
      });

      // A scenario drives the real pipeline, so every other connected client
      // (dashboards, mobile zone lists) sees the committed zone state at once
      // instead of waiting for its next poll.
      if (realtimeHub) {
        await publishZoneSnapshot(realtimeHub, result.zone.id);
      }

      res.status(201).json(ok(result));
    })
  );


  return router;
}