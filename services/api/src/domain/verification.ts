import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { prisma, type Prisma, type VerificationPurpose } from "@parada/database";
import { TooManyRequestsError, VerificationError } from "../http/errors";

type Db = Prisma.TransactionClient | typeof prisma;

export interface IssuedSecret {
  /** The plaintext code/token. Only ever handed to the mailer — never stored or logged. */
  secret: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export interface IssueOptions {
  userId: string;
  purpose: VerificationPurpose;
  /** New email / phone for change flows; null otherwise. */
  target?: string | null;
  kind: "code" | "token";
  ttlMs: number;
  cooldownMs: number;
}

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Issues and consumes one-time secrets. Two shapes:
 *
 *   - 6-digit numeric `code`: typed by a person (email verification, email /
 *     phone change). Low entropy, so it is attempt-limited (`CODE_MAX_ATTEMPTS`
 *     wrong guesses burn it) and short-lived.
 *   - 256-bit hex `token`: carried by a reset link. High entropy, 30 minutes.
 *
 * Only `HMAC-SHA256(secret)` is stored; a database read-out therefore cannot
 * be replayed without the server key. Every secret is single-use (consumedAt)
 * and issuing a new one for the same user+purpose retires the previous one.
 */
export class VerificationService {
  constructor(
    private readonly hmacKey: string,
    private readonly clock: () => Date = () => new Date()
  ) {}

  hash(secret: string): string {
    return createHmac("sha256", this.hmacKey).update(secret).digest("hex");
  }

  generate(kind: "code" | "token"): string {
    return kind === "code"
      ? String(randomInt(0, 1_000_000)).padStart(6, "0")
      : randomBytes(32).toString("hex");
  }

  /** When the user may next request a secret of this purpose (null = now). */
  async resendAvailableAt(
    db: Db,
    userId: string,
    purpose: VerificationPurpose,
    cooldownMs: number
  ): Promise<Date | null> {
    const latest = await db.verificationToken.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!latest) return null;
    const at = new Date(latest.createdAt.getTime() + cooldownMs);
    return at.getTime() > this.clock().getTime() ? at : null;
  }

  /**
   * Creates a fresh secret, retiring any earlier live one for the same
   * user+purpose. Throws 429 (with `resendAvailableAt`) inside the cooldown.
   */
  async issue(db: Db, options: IssueOptions): Promise<IssuedSecret> {
    const now = this.clock();
    const blockedUntil = await this.resendAvailableAt(db, options.userId, options.purpose, options.cooldownMs);
    if (blockedUntil) {
      throw new TooManyRequestsError("Please wait before requesting another code.", {
        resendAvailableAt: blockedUntil.toISOString(),
      });
    }

    await db.verificationToken.updateMany({
      where: { userId: options.userId, purpose: options.purpose, consumedAt: null },
      data: { consumedAt: now },
    });

    const secret = this.generate(options.kind);
    const expiresAt = new Date(now.getTime() + options.ttlMs);
    await db.verificationToken.create({
      data: {
        userId: options.userId,
        purpose: options.purpose,
        tokenHash: this.hash(secret),
        target: options.target ?? null,
        expiresAt,
        createdAt: now,
      },
    });
    return { secret, expiresAt, resendAvailableAt: new Date(now.getTime() + options.cooldownMs) };
  }

  /**
   * Validates a typed code against the user's live secret for `purpose` and
   * marks it consumed. Wrong guesses count against `CODE_MAX_ATTEMPTS`; once
   * exceeded the code is burned and a new one must be requested.
   */
  async consumeCode(
    db: Db,
    input: { userId: string; purpose: VerificationPurpose; code: string }
  ): Promise<{ target: string | null }> {
    const now = this.clock();
    const live = await db.verificationToken.findFirst({
      where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!live) {
      throw new VerificationError("CODE_INVALID", "That code is not valid. Request a new one.");
    }
    if (live.expiresAt.getTime() <= now.getTime()) {
      await db.verificationToken.update({ where: { id: live.id }, data: { consumedAt: now } });
      throw new VerificationError("CODE_EXPIRED", "That code has expired. Request a new one.");
    }
    if (!this.matches(live.tokenHash, input.code)) {
      const attempts = live.attempts + 1;
      await db.verificationToken.update({
        where: { id: live.id },
        data: { attempts, ...(attempts >= CODE_MAX_ATTEMPTS ? { consumedAt: now } : {}) },
      });
      throw new VerificationError(
        "CODE_INVALID",
        attempts >= CODE_MAX_ATTEMPTS
          ? "Too many incorrect attempts. Request a new code."
          : "That code is incorrect."
      );
    }
    await db.verificationToken.update({ where: { id: live.id }, data: { consumedAt: now } });
    return { target: live.target };
  }

  /** Validates a link token (looked up by hash) and marks it consumed. */
  async consumeToken(
    db: Db,
    input: { purpose: VerificationPurpose; token: string }
  ): Promise<{ userId: string }> {
    const now = this.clock();
    const row = await db.verificationToken.findUnique({ where: { tokenHash: this.hash(input.token) } });
    if (!row || row.purpose !== input.purpose || row.consumedAt) {
      throw new VerificationError("TOKEN_INVALID", "This reset link is invalid or has already been used.");
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      await db.verificationToken.update({ where: { id: row.id }, data: { consumedAt: now } });
      throw new VerificationError("TOKEN_EXPIRED", "This reset link has expired. Request a new one.");
    }
    await db.verificationToken.update({ where: { id: row.id }, data: { consumedAt: now } });
    return { userId: row.userId };
  }

  private matches(storedHash: string, candidate: string): boolean {
    const a = Buffer.from(storedHash, "hex");
    const b = Buffer.from(this.hash(candidate), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
