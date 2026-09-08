import { Router, type RequestHandler } from "express";
import { currentAuth } from "../middleware/auth";
import type { RealtimeHub } from "../realtime/hub";

const HEARTBEAT_MS = 25_000;

/**
 * GET /realtime/stream — Server-Sent Events. Mounted AFTER the shared
 * authMiddleware in app.ts, so `res.locals.auth` is always populated here;
 * this route adds no separate auth logic beyond reading that identity.
 *
 * This route is delivery only: it registers the caller with the hub and keeps
 * the connection open. It never reads or writes application data itself.
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
