import { Router, type RequestHandler } from "express";
import { timingSafeEqual } from "crypto";
import { ok } from "../http/response";
import { BadRequestError, UnauthorizedError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { rateLimit } from "../http/rateLimit";
import { OccupancyService } from "../domain/occupancy";
import { ZoneService } from "../domain/zones";
import { publishOccupancyOutcome, withoutNotifications } from "../realtime/occupancyEvents";
import type { RealtimeHub } from "../realtime/hub";
import type { OccupancyEventType } from "@parada/database";

export interface EventsRouterOptions {
  /** Shared service API key. If set, POST /zones/:id/events requires it. */
  cameraApiKey?: string | null;
  /** Per-camera event-ingestion rate limit. Defaults to a generous 300/min. */
  rateLimit?: { limit: number; windowMs: number };
  /** Publishes ZONE_OCCUPANCY_UPDATED after a successful, committed event. */
  realtimeHub?: RealtimeHub;
}

/** Constant-time string comparison (length-guarded) to avoid timing leaks. */
function secureEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function eventsRouter(occupancy: OccupancyService, options: EventsRouterOptions = {}): Router {
  const router = Router();
  const cameraApiKey = options.cameraApiKey ?? null;
  const zones = new ZoneService();

  // Per-camera event budget. Cameras on a shared egress IP would otherwise
  // throttle each other, so the budget is keyed by the trusted camera
  // identifier carried in the (already API-key-guarded) payload body.
  const cameraEventLimit = rateLimit({
    ...(options.rateLimit ?? { limit: 300, windowMs: 60_000 }),
    keyFor: (req) => {
      const cameraIdentifier = req.body?.["cameraIdentifier"];
      return typeof cameraIdentifier === "string" && cameraIdentifier.length > 0
        ? `camera:${cameraIdentifier}`
        : `camera:${req.ip ?? "unknown"}`;
    },
  });

  const requireCameraApiKey: RequestHandler = (req, _res, next) => {
    // When no API key is configured (trusted development only), the endpoint is
    // left open. In any real deployment a key must be set, and every event call
    // must present it via X-API-Key. Comparison is timing-safe.
    if (cameraApiKey === null) {
      next();
      return;
    }
    const provided = req.headers["x-api-key"];
    if (typeof provided !== "string" || !secureEqual(provided, cameraApiKey)) {
      next(new UnauthorizedError("Invalid or missing camera API key."));
      return;
    }
    next();
  };

  router.post(
    "/zones/:zoneId/events",
    // Authenticate BEFORE metering. With the limiter first, an unauthenticated
    // caller could name any camera in the body and burn that camera's entire
    // per-minute budget, locking a real camera out of reporting occupancy.
    // Only requests that already presented a valid key consume the budget.
    requireCameraApiKey,
    cameraEventLimit,
    asyncHandler(async (req, res) => {
      const zoneId = req.params["zoneId"]!;
      const body: Record<string, unknown> = req.body ?? {};

      const cameraIdentifier = body["cameraIdentifier"];
      const sourceEventId = body["sourceEventId"];
      const eventType = body["eventType"];
      const detectedPlate = body["detectedPlate"];
      const ocrConfidence = body["ocrConfidence"];
      const detectedAt = body["detectedAt"];

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
      if (detectedAt !== undefined && detectedAt !== null) {
        if (typeof detectedAt !== "string" || Number.isNaN(new Date(detectedAt).getTime())) {
          throw new BadRequestError("'detectedAt' must be a valid ISO date string.");
        }
      }

      const result = await occupancy.processEvent({
        zoneId,
        cameraIdentifier,
        sourceEventId,
        eventType: eventType as OccupancyEventType,
        detectedPlate: typeof detectedPlate === "string" ? detectedPlate : null,
        ocrConfidence: typeof ocrConfidence === "number" ? ocrConfidence : null,
        detectedAt: typeof detectedAt === "string" ? detectedAt : null,
      });

      // Preserve the existing wire contract: clients today receive the bare
      // occupancy event. The registered-vehicle path nests it under `.event`;
      // the guest path returns the event + admission decision. The pipeline's
      // `notifications` are realtime-only and never part of the response.
      const occupancyEvent = "event" in result ? result.event : withoutNotifications(result);

      // Publish AFTER processEvent's transaction has committed. Everything is
      // read back from the database (zone, session), never taken from the
      // mutation's own return value.
      if (options.realtimeHub) {
        await publishOccupancyOutcome(options.realtimeHub, zoneId, result, zones);
      }

      res.status(201).json(ok(occupancyEvent));
    })
  );

  return router;
}
