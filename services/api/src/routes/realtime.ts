import { Router, type Request, type RequestHandler } from "express";
import { REALTIME_SYNC_EVENT, type RealtimeSyncFrame } from "@parada/types";
import { currentAuth } from "../middleware/auth";
import type { RealtimeHub } from "../realtime/hub";

const HEARTBEAT_MS = 25_000;

/**
 * The reconnect cursor. Browsers and react-native-sse both re-send the last
 * `id:` they saw as the `Last-Event-ID` header automatically; the query
 * parameter is accepted as a fallback for a client that reconnects by building
 * a fresh connection itself. Anything that is not a non-negative integer is
 * treated as "no cursor" rather than an error — a malformed cursor must not
 * cost the caller their stream.
 */
function readCursor(req: Request): number | null {
  const header = req.header("Last-Event-ID");
  const query = req.query["lastEventId"];
  const raw = header ?? (typeof query === "string" ? query : undefined);
  if (raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * GET /realtime/stream — Server-Sent Events. Mounted AFTER the shared
 * authMiddleware in app.ts, so `res.locals.auth` is always populated here;
 * this route adds no separate auth logic beyond reading that identity.
 *
 * This route is delivery only: it registers the caller with the hub and keeps
 * the connection open. It never reads or writes application data itself, and
 * replay is served from the hub's in-memory buffer — never from the database.
 */
export function realtimeRouter(hub: RealtimeHub): Router {
  const router = Router();

  const stream: RequestHandler = (req, res) => {
    const auth = currentAuth(res);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const clientId = `${auth.id}:${auth.jti}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const client = { id: clientId, userId: auth.id, role: auth.role, write: (chunk: string) => res.write(chunk) };

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = hub.subscribe(client);
    } catch (err) {
      res.write(`event: ERROR\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      res.end();
      return;
    }

    res.write(": connected\n\n");

    // Missed-event recovery. Subscribing first means nothing published from
    // here on is lost; taking the replay snapshot in the SAME synchronous run
    // means no publish can interleave between the two, so the client sees each
    // missed event exactly once and in ascending seq order.
    const cursor = readCursor(req);
    if (cursor !== null) {
      const missed = hub.replay(client, cursor);
      if (missed === null) {
        // The cursor has aged out of the buffer (or predates a restart). Say so
        // explicitly instead of implying continuity we cannot back up; the
        // client refetches authoritative state over REST.
        const sync: RealtimeSyncFrame = { reason: "GAP", sinceSeq: cursor, headSeq: hub.headSeq() };
        res.write(`event: ${REALTIME_SYNC_EVENT}\ndata: ${JSON.stringify(sync)}\n\n`);
      } else {
        for (const event of missed) {
          res.write(hub.frame(event));
        }
      }
    }

    const heartbeat = setInterval(() => {
      hub.sendComment(client, "heartbeat");
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe?.();
    };

    req.on("close", cleanup);
    res.on("error", cleanup);
  };

  router.get("/realtime/stream", stream);

  return router;
}
