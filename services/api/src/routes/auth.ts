import express, { Router, type RequestHandler } from "express";
import { ok } from "../http/response";
import { BadRequestError, UnauthorizedError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { AuthService } from "../domain/auth";
import { AccountService, AVATAR_MAX_BYTES } from "../domain/account";
import type { RealtimeHub } from "../realtime/hub";
import { currentUserId } from "../middleware/auth";
import { rateLimit } from "../http/rateLimit";
import {
  requireString,
  validateCode,
  validateDisplayName,
  validateEmail,
  validatePhone,
  validateResetToken,
  validateUsername,
} from "../http/validate";

export function authRouter(
  auth: AuthService,
  authMiddleware?: RequestHandler,
  options: {
    rateLimit?: { limit: number; windowMs: number };
    account?: AccountService;
    /** Open SSE streams of a user are dropped when their tokens are invalidated. */
    realtimeHub?: RealtimeHub;
  } = {}
): Router {
  const router = Router();
  const account =
    options.account ?? new AccountService({ mailer: auth.mailer, verification: auth.verification });

  // Credential endpoints are the only unauthenticated write surface. Register,
  // login and every verification/recovery request share one bucket so an
  // attacker cannot spread a burst across independent allowances.
  const credentialLimit = rateLimit(options.rateLimit ?? { limit: 10, windowMs: 60_000 });

  router.post(
    "/register",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const name = validateDisplayName(body["name"]);
      const email = validateEmail(body["email"]);
      const password = requireString(body, "password");

      auth.validatePassword(password);

      const result = await auth.register({ name, email, password });
      // No token: the account cannot sign in until the emailed code is confirmed.
      res.status(201).json(ok({ user: result.user, verification: result.verification }));
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

  router.post(
    "/verify-email",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const email = validateEmail(body["email"]);
      const code = validateCode(body["code"]);
      const user = await auth.verifyEmail({ email, code });
      res.json(ok({ user }));
    })
  );

  router.post(
    "/resend-verification",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const email = validateEmail(body["email"]);
      // Generic 202 whether or not the address exists / is already verified.
      const verification = await auth.resendVerification(email);
      res.status(202).json(ok({ verification }));
    })
  );

  router.post(
    "/forgot-password",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const email = validateEmail(body["email"]);
      await auth.forgotPassword(email);
      res.status(202).json(
        ok({ message: "If an account exists for that email, a reset link has been sent." })
      );
    })
  );

  router.post(
    "/reset-password",
    credentialLimit,
    asyncHandler(async (req, res) => {
      const body: Record<string, unknown> = req.body ?? {};
      const token = validateResetToken(body["token"]);
      const newPassword = requireString(body, "newPassword");
      const user = await auth.resetPassword({ token, newPassword });
      options.realtimeHub?.disconnectUser(user.id);
      res.json(ok({ user }));
    })
  );

  if (!authMiddleware) {
    const denied = asyncHandler(async () => {
      throw new UnauthorizedError("Authentication required.");
    });
    router.post("/logout", denied);
    router.get("/me", denied);
    router.patch("/me", denied);
    router.post("/password", denied);
    return router;
  }

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

  // ---------------------------------------------------------------------------
  // Profile (name / username) — server-authoritative, owner only.
  // ---------------------------------------------------------------------------

  router.patch("/me", authMiddleware, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const body: Record<string, unknown> = req.body ?? {};
    const input: { name?: string; username?: string | null } = {};
    if (body["name"] !== undefined) input.name = validateDisplayName(body["name"]);
    if (body["username"] !== undefined) {
      input.username = body["username"] === null ? null : validateUsername(body["username"]);
    }
    const user = await account.updateProfile(userId, input);
    res.json(ok(user));
  }));

  // ---------------------------------------------------------------------------
  // Password change (authenticated). Returns a fresh token: the change
  // invalidates every token issued before it, including the caller's.
  // ---------------------------------------------------------------------------

  router.post("/password", authMiddleware, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const body: Record<string, unknown> = req.body ?? {};
    const currentPassword = requireString(body, "currentPassword");
    const newPassword = requireString(body, "newPassword");
    if (body["confirmPassword"] !== undefined && body["confirmPassword"] !== newPassword) {
      throw new BadRequestError("'confirmPassword' must match 'newPassword'.");
    }
    const result = await auth.changePassword(userId, { currentPassword, newPassword });
    // Every earlier token is now invalid; streams opened with one must not
    // keep flowing. The caller reconnects with the fresh token it receives.
    options.realtimeHub?.disconnectUser(userId);
    res.json(ok({ user: result.user, token: result.token }));
  }));

  // ---------------------------------------------------------------------------
  // Email / phone change — two-step with a 6-digit code.
  // ---------------------------------------------------------------------------

  router.post("/me/email", authMiddleware, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const body: Record<string, unknown> = req.body ?? {};
    const email = validateEmail(body["email"]);
    const verification = await account.requestEmailChange(userId, email);
    res.status(202).json(ok({ verification }));
  }));

  router.post("/me/email/confirm", authMiddleware, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const body: Record<string, unknown> = req.body ?? {};
    const code = validateCode(body["code"]);
    const user = await account.confirmEmailChange(userId, code);
    res.json(ok(user));
  }));

  router.delete("/me/email", authMiddleware, asyncHandler(async (_req, res) => {
    const userId = currentUserId(res);
    const user = await account.cancelEmailChange(userId);
    res.json(ok(user));
  }));

  router.post("/me/phone", authMiddleware, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const body: Record<string, unknown> = req.body ?? {};
    if (body["phone"] === null) {
      const user = await account.requestPhoneChange(userId, null);
      res.json(ok({ user }));
      return;
    }
    const phone = validatePhone(body["phone"]);
    const result = await account.requestPhoneChange(userId, phone);
    res.status(202).json(ok({ verification: result }));
  }));

  router.post("/me/phone/confirm", authMiddleware, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const body: Record<string, unknown> = req.body ?? {};
    const code = validateCode(body["code"]);
    const user = await account.confirmPhoneChange(userId, code);
    res.json(ok(user));
  }));

  // ---------------------------------------------------------------------------
  // Profile picture: raw image bytes in the body (Content-Type image/*), size
  // capped by the parser and the real type sniffed by the domain.
  // ---------------------------------------------------------------------------

  const avatarBody = express.raw({ type: () => true, limit: AVATAR_MAX_BYTES });

  router.put("/me/avatar", authMiddleware, avatarBody, asyncHandler(async (req, res) => {
    const userId = currentUserId(res);
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const user = await account.setAvatar(userId, bytes);
    res.json(ok(user));
  }));

  router.delete("/me/avatar", authMiddleware, asyncHandler(async (_req, res) => {
    const userId = currentUserId(res);
    const user = await account.deleteAvatar(userId);
    res.json(ok(user));
  }));

  return router;
}
