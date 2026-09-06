import { Router, type RequestHandler } from "express";
import { ok } from "../http/response";
import { BadRequestError, UnauthorizedError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { AuthService } from "../domain/auth";
import { currentUserId } from "../middleware/auth";
import { rateLimit } from "../http/rateLimit";

export function authRouter(auth: AuthService, authMiddleware?: RequestHandler): Router {
  const router = Router();

  // Credential endpoints are the only unauthenticated write surface.
  const credentialLimit = rateLimit({ limit: 10, windowMs: 60_000 });

  router.post(
    "/register",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const name = body["name"];
      const email = body["email"];
      const password = body["password"];

      if (typeof name !== "string" || name.trim().length === 0) {
        throw new BadRequestError("'name' (string) is required.");
      }
      if (typeof email !== "string" || email.trim().length === 0) {
        throw new BadRequestError("'email' (string) is required.");
      }
      if (typeof password !== "string") {
        throw new BadRequestError("'password' (string) is required.");
      }

      auth.validatePassword(password);

      const result = await auth.register({ name: name.trim(), email: email.trim(), password });
      res.status(201).json(ok({ user: result.user, token: result.token }));
    })
  );

  router.post(
    "/login",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const email = body["email"];
      const password = body["password"];

      if (typeof email !== "string" || email.trim().length === 0) {
        throw new BadRequestError("'email' (string) is required.");
      }
      if (typeof password !== "string") {
        throw new BadRequestError("'password' (string) is required.");
      }

      const result = await auth.login({ email: email.trim(), password });
      res.json(ok({ user: result.user, token: result.token }));
    })
  );

  if (authMiddleware) {
    router.post("/logout", authMiddleware, asyncHandler(async (req, res) => {
      const authHeader = req.headers["authorization"];
      if (!authHeader || typeof authHeader !== "string") {
        throw new UnauthorizedError("Authentication required.");
      }
      const [scheme, token] = authHeader.split(" ");
      if (scheme?.toLowerCase() !== "bearer" || !token) {
        throw new UnauthorizedError("Authentication required.");
      }

      const payload = await auth["tokens"].verify(token);
      await auth.revoke(payload.jti);
      res.status(204).send();
    }));

    router.get("/me", authMiddleware, asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const user = await auth.loadUser(userId);
      res.json(ok(user));
    }));
  } else {
    router.post("/logout", asyncHandler(async () => {
      throw new UnauthorizedError("Authentication required.");
    }));
    router.get("/me", asyncHandler(async () => {
      throw new UnauthorizedError("Authentication required.");
    }));
  }

  return router;
}