import type { Prisma } from "@parada/database";
import type { ParkingFeeConfig } from "@parada/types";

/**
 * Pure, testable parking-fee calculation.
 *
 * Business rule (from the establishment's fee configuration):
 *   - The first `baseDurationHours` (default 2h) costs a flat `baseFee` (default ₱20).
 *   - Every *succeeded* (started) additional hour adds `additionalFeePerHour` (default ₱10).
 *
 * Examples (defaults, baseFee=20, baseDurationHours=2, additionalFeePerHour=10):
 *   - 2h 00m -> ₱20
 *   - 2h 01m -> ₱30
 *   - 3h 00m -> ₱30
 *   - 3h 01m -> ₱40
 *
 * Durations at or below `baseDurationHours` fall within the base block.
 */
export function calculateParkingFee(
  durationMs: number,
  feeConfig: ParkingFeeConfig
): { amount: number; breakdown: { baseFee: number; additionalHours: number; additionalFee: number; durationMs: number } } {
  const { baseFee, baseDurationHours, additionalFeePerHour } = feeConfig;

  const safeMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const baseMs = baseDurationHours * 60 * 60 * 1000;

  if (safeMs <= baseMs) {
    return {
      amount: baseFee,
      breakdown: {
        baseFee,
        additionalHours: 0,
        additionalFee: 0,
        durationMs: safeMs,
      },
    };
  }

  const overMs = safeMs - baseMs;
  const additionalHours = Math.ceil(overMs / (60 * 60 * 1000));
  const additionalFee = additionalHours * additionalFeePerHour;

  return {
    amount: baseFee + additionalFee,
    breakdown: {
      baseFee,
      additionalHours,
      additionalFee,
      durationMs: safeMs,
    },
  };
}

/**
 * Persist the fee for a session that has just been completed, inside the
 * caller's transaction. Both exit paths (camera pipeline and user-initiated)
 * route through here so a completed session can never end up unpriced.
 * `userId` is null for account-less guest sessions; the fee policy is the same.
 */
export async function persistSessionFee(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    zoneId: string;
    userId: string | null;
    durationMs: number;
    feeConfig: ParkingFeeConfig;
  }
) {
  const fee = calculateParkingFee(input.durationMs, input.feeConfig);
  const row = await tx.parkingFee.create({
    data: {
      sessionId: input.sessionId,
      zoneId: input.zoneId,
      userId: input.userId,
      amount: fee.amount,
      rateBreakdown: fee.breakdown,
      status: "PENDING",
    },
  });
  return { amount: fee.amount, breakdown: fee.breakdown, row };
}
