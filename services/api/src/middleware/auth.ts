import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Role } from "@parada/types";
import type { TokenService } from "../domain/token";
import { ForbiddenError, UnauthorizedError } from "../http/errors";

/** Attached to the request by requireAuth via res.locals. */
export interface RequestUser {
  id: string;
  role: Role;
  jti: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      auth?: RequestUser;
    }
  }
}

function readBearerToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export function createAuthMiddleware(
  tokens: TokenService,
  auth: {
    isRevoked: (jti: string) => Promise<boolean>;
    /** Account still ACTIVE and token issued under the current password generation. */
    isSessionValid?: (claims: { sub: string; tokenVersion: number }) => Promise<boolean>;
  }
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = readBearerToken(req);
      if (!raw) {
        throw new UnauthorizedError("Authentication required.");
      }
      let claims;
      try {
        claims = tokens.verify(raw);
      } catch {
        throw new UnauthorizedError("Invalid or expired token.");
      }
      if (await auth.isRevoked(claims.jti)) {
        throw new UnauthorizedError("Token has been revoked.");
      }
      if (auth.isSessionValid && !(await auth.isSessionValid(claims))) {
        throw new UnauthorizedError("Token has been revoked.");
      }
      res.locals.auth = { id: claims.sub, role: claims.role, jti: claims.jti };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Requires the request to be authenticated (must run after requireAuth). */
export function requireRole(role: Role): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = res.locals.auth;
    if (!auth) {
      next(new UnauthorizedError("Authentication required."));
      return;
    }
    if (auth.role !== role) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

/** Returns the authenticated user's id or throws if not authenticated. */
export function currentUserId(res: Response): string {
  const auth = res.locals.auth;
  if (!auth) {
    throw new UnauthorizedError("Authentication required.");
  }
  return auth.id;
}

export function currentAuth(res: Response): RequestUser {
  const auth = res.locals.auth;
  if (!auth) {
    throw new UnauthorizedError("Authentication required.");
  }
  return auth;
}
