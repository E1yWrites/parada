import { prisma, type Prisma } from "@parada/database";
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
   * Issue a WRONG_ZONE violation if this vehicle has exhausted its warnings.
   * Runs inside the caller's occupancy transaction so the violation and the
   * event that caused it commit together. Returns the violation, or null when
   * the entry is still within the warning allowance.
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

    const fineAmount = await resolveViolationFine(this.config, "WRONG_ZONE");
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

    await tx.notification.create({
      data: {
        zoneId: input.zoneId,
        userId: input.userId,
        type: "VIOLATION_ISSUED",
        message: `A wrong-zone violation was issued for your vehicle. Fine: ${fineAmount}.`,
        targetRole: "USER",
      },
    });

    return violation;
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
      await tx.notification.create({
        data: {
          zoneId: violation.zoneId,
          type: "VIOLATION_APPEAL_SUBMITTED",
          message: `A driver appealed a ${violation.violationType} violation.`,
          targetRole: "ADMIN",
        },
      });
      return appeal;
    });
  }

  /**
   * Admin decision on an appeal. Approving dismisses the violation, rejecting
   * upholds it; either way the driver is notified of the outcome.
   */
  async review(appealId: string, status: "APPROVED" | "REJECTED", reviewerId: string) {
    const appeal = await prisma.violationAppeal.findUnique({
      where: { id: appealId },
      include: { violation: true },
    });
    if (!appeal) {
      throw new NotFoundError("Appeal not found.");
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.violationAppeal.update({
        where: { id: appeal.id },
        data: { status, reviewedBy: reviewerId, reviewedAt: new Date() },
      });
      await tx.violation.update({
        where: { id: appeal.violationId },
        data: { status: status === "APPROVED" ? "DISMISSED" : "UPHELD" },
      });
      await tx.notification.create({
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
      return updated;
    });
  }
}
