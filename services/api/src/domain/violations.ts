import { prisma, type Prisma, type ViolationStatus } from "@parada/database";
import { WRONG_ZONE_WARNINGS_BEFORE_VIOLATION } from "@parada/config";
import { ConflictError, ForbiddenError, NotFoundError } from "../http/errors";
import { ConfigService, resolveViolationFine } from "./config";

/**
 * Establishment-defined parking violations and the user's right to dispute
 * them. These are house rules of the parking facility — never law enforcement.
 *
 * Wrong-zone escalation: the first offences are warnings only (recorded as
 * WRONG_ZONE_WARNING anomalies). Once a vehicle has already been warned
 * `WRONG_ZONE_WARNINGS_BEFORE_VIOLATION` times, the next wrong-zone entry
 * issues a Violation with the configured fine.
 */
export class ViolationService {
  constructor(private readonly config: ConfigService) {}

  /**
   * The ONLY status transitions an admin may trigger directly through the
   * status endpoint. Every other move is rejected as a domain conflict:
   *   - the appeal flow (PENDING -> APPEALED, APPEALED -> DISMISSED/UPHELD)
   *     runs through `appeal`/`review` instead;
   *   - FINE_PAID is a terminal state reserved for a future payment workflow
   *     and is not settable by status mutation.
   * A status not listed has no out-edges (it is terminal/processing-only).
   */
  private static readonly ADMIN_STATUS_TRANSITIONS: Record<ViolationStatus, readonly ViolationStatus[]> = {
    PENDING: ["DISMISSED"],
    APPEALED: [],
    UPHELD: [],
    DISMISSED: [],
    FINE_PAID: [],
  };

  /**
   * Directly move a violation to a target status as an administrator. Only a
   * transition the state machine permits is applied; anything else is a
   * CONFLICT, never a silent database write. The acting administrator comes
   * from the authenticated request context at the route (never the body) —
   * the appeal path records the reviewer on `ViolationAppeal.reviewedBy`.
   */
  async adminUpdateStatus(violationId: string, target: ViolationStatus) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.violation.findUnique({
        where: { id: violationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          zone: { select: { id: true, name: true, code: true } },
          session: { select: { id: true, zoneId: true, enteredAt: true, exitedAt: true, status: true } },
          appeal: true,
        },
      });
      if (!existing) throw new NotFoundError("Violation not found.");

      const allowed = ViolationService.ADMIN_STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(target)) {
        throw new ConflictError(`Cannot transition a ${existing.status} violation to '${target}' directly.`);
      }

      return tx.violation.update({
        where: { id: violationId },
        data: { status: target },
        include: {
          user: { select: { id: true, name: true, email: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          zone: { select: { id: true, name: true, code: true } },
          session: { select: { id: true, zoneId: true, enteredAt: true, exitedAt: true, status: true } },
          appeal: true,
        },
      });
    });
  }

  /**
   * Issue a WRONG_ZONE violation if this vehicle has exhausted its warnings.
   * Runs inside the caller's occupancy transaction so the violation and the
   * event that caused it commit together. Returns the violation together with
   * the driver notification it created (so the caller can publish it after
   * commit), or null when the entry is still within the warning allowance.
   */
  async escalateWrongZone(
    tx: Prisma.TransactionClient,
    input: { userId: string; vehicleId: string; zoneId: string; sessionId?: string; assignedZoneCode: string }
  ) {
    const priorWarnings = await tx.occupancyAnomaly.count({
      where: { vehicleId: input.vehicleId, anomalyType: "WRONG_ZONE_WARNING" },
    });
    // The anomaly for the current entry is written by the caller after this
    // runs, so `priorWarnings` counts only previous offences.
    if (priorWarnings < WRONG_ZONE_WARNINGS_BEFORE_VIOLATION) {
      return null;
    }

    // Resolved on the caller's transaction client: this runs inside the
    // occupancy transaction, so the global client would need a second pooled
    // connection while the first is still held.
    const fineAmount = await resolveViolationFine(this.config, "WRONG_ZONE", tx);
    const violation = await tx.violation.create({
      data: {
        userId: input.userId,
        vehicleId: input.vehicleId,
        zoneId: input.zoneId,
        sessionId: input.sessionId ?? null,
        violationType: "WRONG_ZONE",
        description: `Entered a zone other than the assigned zone '${input.assignedZoneCode}' after ${priorWarnings} warning(s).`,
        fineAmount,
        status: "PENDING",
      },
    });

    const notification = await tx.notification.create({
      data: {
        zoneId: input.zoneId,
        userId: input.userId,
        type: "VIOLATION_ISSUED",
        message: `A wrong-zone violation was issued for your vehicle. Fine: ${fineAmount}.`,
        targetRole: "USER",
      },
    });

    return { violation, notification };
  }

  /** The authenticated user's own violations, newest first. */
  async listForUser(userId: string) {
    return prisma.violation.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
      include: {
        zone: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
        appeal: { select: { id: true, status: true, reason: true, reviewedAt: true, createdAt: true } },
      },
    });
  }

  /**
   * Dispute one of the user's own violations. Ownership is taken from the
   * authenticated identity, never from the request body. One appeal per
   * violation, and only while the violation is still open.
   */
  async appeal(userId: string, violationId: string, reason: string) {
    const violation = await prisma.violation.findFirst({
      where: { id: violationId, userId },
      include: { appeal: true },
    });
    if (!violation) {
      throw new NotFoundError("Violation not found.");
    }
    if (violation.appeal) {
      throw new ConflictError("This violation has already been appealed.");
    }
    if (violation.status !== "PENDING") {
      throw new ForbiddenError("This violation can no longer be appealed.");
    }

    return prisma.$transaction(async (tx) => {
      const appeal = await tx.violationAppeal.create({
        data: { violationId: violation.id, userId, reason, status: "PENDING" },
      });
      await tx.violation.update({ where: { id: violation.id }, data: { status: "APPEALED" } });
      const notification = await tx.notification.create({
        data: {
          zoneId: violation.zoneId,
          type: "VIOLATION_APPEAL_SUBMITTED",
          message: `A driver appealed a ${violation.violationType} violation.`,
          targetRole: "ADMIN",
        },
      });
      return { appeal, notification };
    });
  }

  /**
   * Admin decision on an appeal. Approving dismisses the violation, rejecting
   * upholds it; either way the driver is notified of the outcome.
   *
   * An appeal is decided exactly ONCE. Without that guard a second review
   * silently flipped a settled violation (DISMISSED -> UPHELD, or back), issued
   * a contradicting notification to the driver, and overwrote the original
   * reviewer and timestamp — so the audit trail no longer showed who actually
   * decided it. The re-read happens inside the transaction so two concurrent
   * reviews cannot both pass the check.
   */
  async review(appealId: string, status: "APPROVED" | "REJECTED", reviewerId: string) {
    return prisma.$transaction(async (tx) => {
      const appeal = await tx.violationAppeal.findUnique({
        where: { id: appealId },
        include: { violation: true },
      });
      if (!appeal) {
        throw new NotFoundError("Appeal not found.");
      }
      if (appeal.status !== "PENDING") {
        throw new ConflictError(`This appeal has already been ${appeal.status.toLowerCase()}.`);
      }

      const updated = await tx.violationAppeal.update({
        where: { id: appeal.id },
        data: { status, reviewedBy: reviewerId, reviewedAt: new Date() },
        include: {
          user: { select: { id: true, name: true, email: true } },
          violation: {
            include: {
              zone: { select: { id: true, name: true, code: true } },
              vehicle: { select: { id: true, plateNumber: true } },
            },
          },
        },
      });
      await tx.violation.update({
        where: { id: appeal.violationId },
        data: { status: status === "APPROVED" ? "DISMISSED" : "UPHELD" },
      });
      const notification = await tx.notification.create({
        data: {
          zoneId: appeal.violation.zoneId,
          userId: appeal.userId,
          type: "VIOLATION_APPEAL_RESULT",
          message:
            status === "APPROVED"
              ? "Your appeal was approved and the violation was dismissed."
              : "Your appeal was rejected and the violation stands.",
          targetRole: "USER",
        },
      });
      return { appeal: updated, notification };
    });
  }
}
