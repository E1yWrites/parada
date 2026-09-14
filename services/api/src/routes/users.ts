import { Router } from "express";
import { createHash } from "crypto";
import { asyncHandler } from "../http/asyncHandler";
import { currentAuth } from "../middleware/auth";
import type { AccountService } from "../domain/account";

/**
 * Profile-picture delivery. Authenticated (the router is mounted behind the
 * auth middleware); readable by the owner and by ADMIN only — enforced in the
 * domain. Served with a strong ETag so clients revalidate cheaply and
 * `Cache-Control: private` so no shared cache keeps a user's picture.
 */
export function usersRouter(account: AccountService): Router {
  const router = Router();

  router.get(
    "/users/:id/avatar",
    asyncHandler(async (req, res) => {
      const requester = currentAuth(res);
      const avatar = await account.getAvatar({ id: requester.id, role: requester.role }, req.params["id"]!);
      const etag = `"${createHash("sha1").update(avatar.data).digest("hex")}"`;
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", avatar.updatedAt.toUTCString());
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("Content-Type", avatar.mimeType);
      res.setHeader("Content-Length", String(avatar.data.length));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(avatar.data);
    })
  );

  return router;
}
