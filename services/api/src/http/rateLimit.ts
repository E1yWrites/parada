import type { RequestHandler } from "express";
import type { Request, Response } from "express";
import { HttpError } from "./errors";

class TooManyRequestsError extends HttpError {
  constructor(message = "Too many requests. Please wait and try again.") {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /**
   * Choose the key a request shares its budget under. Defaults to the client
   * IP. A meaningful identity (e.g. the authenticated admin id, or a camera
   * identifier from a trusted body field) separates budgets for different
   * actors and stops one noisy source from exhausting another's allowance.
   */
  keyFor?: (req: Request, res: Response) => string;
}

/**
 * Fixed-window attempt limiter. Emits the standard `TOO_MANY_REQUESTS` (429)
 * API error with a `Retry-After` header when a key exceeds its budget.
 *
 * DEPLOYMENT MODEL: this limiter is **in-memory and per-process**. Each app
 * instance keeps its own counters, so limits are enforced independently per
 * process and reset on restart. That is the correct model for the current
 * single-instance deployment; it is NOT a shared/distributed limiter. If the
 * API is ever run replicated behind a load balancer the counters must move to
 * a shared store (e.g. Redis) before this can be described as cluster-wide.
 *
 * Bounded memory: an opportunistic sweep discards expired entries when the map
 * grows past 10,000 keys.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const keyFor = options.keyFor ?? ((req: Request) => req.ip ?? "unknown");
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();

    // Opportunistic sweep so the map cannot grow without bound.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }

    const key = keyFor(req, res);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > options.limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      next(new TooManyRequestsError());
      return;
    }
    next();
  };
}