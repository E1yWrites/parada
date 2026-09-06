import type { RequestHandler } from "express";
import { HttpError } from "./errors";

class TooManyRequestsError extends HttpError {
  constructor(message = "Too many attempts. Please wait and try again.") {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

/**
 * Fixed-window attempt limiter for credential endpoints. Argon2id already makes
 * login slow, but nothing capped the number of attempts.
 *
 * ponytail: in-memory and per-process, so it does not hold across a restart or
 * a second instance. Swap the Map for Redis if the API is ever run replicated.
 */
export function rateLimit(options: { limit: number; windowMs: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";

    // Opportunistic sweep so the map cannot grow without bound.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > options.limit) {
      next(new TooManyRequestsError());
      return;
    }
    next();
  };
}
