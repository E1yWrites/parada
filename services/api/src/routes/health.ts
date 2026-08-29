import { Router } from "express";
import { prisma } from "@parada/database";
import { ok } from "../http/response";
import { asyncHandler } from "../http/asyncHandler";

export function healthRouter(): Router {
  const router = Router();

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json(ok({ status: "ok", database: "connected" }));
    })
  );

  return router;
}
