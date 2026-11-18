import type { Prisma } from "@parada/database";
import { HttpError } from "../http/errors";

/**
 * One current plan per driver: an assigned zone OR a reservation, never both.
 * (Assignment and reservation are different things; this only stops a driver
 * holding two competing destinations, which later reads as a wrong-zone entry.)
 * Both create paths call this inside their own transaction so the check and the
 * insert cannot interleave with the other path.
 */
export const ACTIVE_PLAN_EXISTS = "ACTIVE_PLAN_EXISTS";

/** Serialises plan creation per user. Transaction-scoped; always taken before any zone lock. */
export async function lockUserPlan(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan:${userId}`}, 0))`;
}

export async function assertNoOtherPlan(
  tx: Prisma.TransactionClient,
  userId: string,
  creating: "ASSIGNMENT" | "RESERVATION"
): Promise<void> {
  const now = new Date();
  if (creating === "RESERVATION") {
    const assignment = await tx.zoneAssignment.findFirst({
      where: { userId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    });
    if (assignment) {
      throw new HttpError(
        409,
        ACTIVE_PLAN_EXISTS,
        "You already have an assigned zone. Cancel it before reserving a space.",
        { existing: "ASSIGNMENT" }
      );
    }
    return;
  }
  const reservation = await tx.reservation.findFirst({
    where: { userId, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: now } },
    select: { id: true },
  });
  if (reservation) {
    throw new HttpError(
      409,
      ACTIVE_PLAN_EXISTS,
      "You already have a reservation. Cancel it before choosing a zone.",
      { existing: "RESERVATION" }
    );
  }
}
