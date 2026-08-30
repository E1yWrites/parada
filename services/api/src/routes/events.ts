import { Router, type RequestHandler } from "express";
import { ok } from "../http/response";
import { BadRequestError, UnauthorizedError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { OccupancyService } from "../domain/occupancy";
import type { OccupancyEventType } from "@parada/database";

export interface EventsRouterOptions {
  /** Shared service API key. If set, POST /zones/:id/events requires it. */
  cameraApiKey?: string | null;
}

export function eventsRouter(occupancy: OccupancyService, options: EventsRouterOptions = {}): Router {
  const router = Router();
  const cameraApiKey = options.cameraApiKey ?? null;

  const requireCameraApiKey: RequestHandler = (req, _res, next) => {
    // When no API key is configured (trusted development only), the endpoint is
    // left open. In any real deployment a key must be set, and every event call
    // must present it via X-API-Key.
    if (cameraApiKey === null) {
      next();
      return;
    }
    const provided = req.headers["x-api-key"];
    if (cameraApiKey && provided !== cameraApiKey) {
      next(new UnauthorizedError("Invalid or missing camera API key."));
      return;
    }
    next();
  };

  router.post(
    "/zones/:zoneId/events",
    requireCameraApiKey,
    asyncHandler(async (req, res) => {
      const zoneId = req.params["zoneId"]!;
      const body: Record<string, unknown> = req.body ?? {};

      const cameraIdentifier = body["cameraIdentifier"];
      const sourceEventId = body["sourceEventId"];
      const eventType = body["eventType"];
      const detectedPlate = body["detectedPlate"];
      const ocrConfidence = body["ocrConfidence"];

      if (typeof cameraIdentifier !== "string" || cameraIdentifier.length === 0) {
        throw new BadRequestError("'cameraIdentifier' (string) is required.");
      }
      if (typeof sourceEventId !== "string" || sourceEventId.length === 0) {
        throw new BadRequestError("'sourceEventId' (string) is required.");
      }
      if (eventType !== "ENTRY" && eventType !== "EXIT") {
        throw new BadRequestError("'eventType' must be 'ENTRY' or 'EXIT'.");
      }
      if (detectedPlate !== undefined && detectedPlate !== null && typeof detectedPlate !== "string") {
        throw new BadRequestError("'detectedPlate' must be a string when present.");
      }
      if (
        ocrConfidence !== undefined &&
        ocrConfidence !== null &&
        (typeof ocrConfidence !== "number" || ocrConfidence < 0 || ocrConfidence > 1)
      ) {
        throw new BadRequestError("'ocrConfidence' must be a number between 0 and 1.");
      }

      const event = await occupancy.processEvent({
        zoneId,
        cameraIdentifier,
        sourceEventId,
        eventType: eventType as OccupancyEventType,
        detectedPlate: typeof detectedPlate === "string" ? detectedPlate : null,
        ocrConfidence: typeof ocrConfidence === "number" ? ocrConfidence : null,
        detectedAt: typeof body["detectedAt"] === "string" ? (body["detectedAt"] as string) : null,
      });

      res.status(201).json(ok(event));
    })
  );

  return router;
}
