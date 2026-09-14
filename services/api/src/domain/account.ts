import { prisma, Prisma } from "@parada/database";
import type { AuthUser, VerificationChallenge } from "@parada/types";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from "../http/errors";
import type { Mailer } from "../mail/mailer";
import { toPublic, userSelect } from "./auth";
import { CODE_RESEND_COOLDOWN_MS, CODE_TTL_MS, VerificationService } from "./verification";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

/**
 * Sniffs the real image type from the first bytes. The declared Content-Type
 * is never trusted: a file is only accepted when its magic bytes are a JPEG,
 * PNG or WebP image.
 */
export function detectImageType(bytes: Buffer): AvatarMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

function toChallenge(issued: { expiresAt: Date; resendAvailableAt: Date }): VerificationChallenge {
  return {
    expiresAt: issued.expiresAt.toISOString(),
    resendAvailableAt: issued.resendAvailableAt.toISOString(),
  };
}

export interface AccountServiceDeps {
  mailer: Mailer;
  verification: VerificationService;
  appName?: string;
  clock?: () => Date;
}

/**
 * Account-profile operations for the authenticated user. Every mutation is
 * scoped to the caller's own id — there is no path that takes a target user
 * id from the client. Email and phone changes are two-step: the request
 * records a pending value and mails a 6-digit code; only confirmation makes
 * the value authoritative.
 */
export class AccountService {
  private readonly mailer: Mailer;
  private readonly verification: VerificationService;
  private readonly appName: string;
  private readonly clock: () => Date;

  constructor(deps: AccountServiceDeps) {
    this.mailer = deps.mailer;
    this.verification = deps.verification;
    this.appName = deps.appName ?? "PARADA";
    this.clock = deps.clock ?? (() => new Date());
  }

  private async requireActive(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Authentication required.");
    }
    return user;
  }

  // ---------------------------------------------------------------------------
  // Name / username
  // ---------------------------------------------------------------------------

  async updateProfile(
    userId: string,
    input: { name?: string; username?: string | null }
  ): Promise<AuthUser> {
    await this.requireActive(userId);
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.username !== undefined) data.username = input.username;
    if (Object.keys(data).length === 0) {
      throw new BadRequestError("Nothing to update.");
    }
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data, select: userSelect });
      return toPublic(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("That username is already taken.");
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Email change (code goes to the NEW address)
  // ---------------------------------------------------------------------------

  /**
   * Records `pendingEmail` and mails a code to it. When the address already
   * belongs to another account nothing is sent, but the response is the same
   * shape so the endpoint does not reveal which addresses are registered; the
   * conflict surfaces only at confirmation time (where the caller has proven
   * control of the address).
   */
  async requestEmailChange(userId: string, newEmail: string): Promise<VerificationChallenge> {
    const user = await this.requireActive(userId);
    if (newEmail === user.email) {
      throw new UnprocessableError("That is already your email address.");
    }
    const taken = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
    const issued = await this.verification.issue(prisma, {
      userId,
      purpose: "EMAIL_CHANGE",
      target: newEmail,
      kind: "code",
      ttlMs: CODE_TTL_MS,
      cooldownMs: CODE_RESEND_COOLDOWN_MS,
    });
    await prisma.user.update({ where: { id: userId }, data: { pendingEmail: newEmail } });
    if (!taken) {
      await this.mailer.send({
        to: newEmail,
        subject: `${this.appName}: confirm your new email address`,
        text:
          `Enter this code in ${this.appName} to confirm your new email address: ${issued.secret}\n\n` +
          `It expires in ${Math.round(CODE_TTL_MS / 60_000)} minutes. ` +
          `If you did not request this change, ignore this message.`,
      });
    }
    return toChallenge(issued);
  }

  async confirmEmailChange(userId: string, code: string): Promise<AuthUser> {
    const user = await this.requireActive(userId);
    if (!user.pendingEmail) {
      throw new UnprocessableError("There is no email change to confirm.");
    }
    const { target } = await this.verification.consumeCode(prisma, { userId, purpose: "EMAIL_CHANGE", code });
    if (!target || target !== user.pendingEmail) {
      throw new UnprocessableError("That code does not match the pending email change. Request a new one.");
    }
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { email: target, pendingEmail: null, emailVerifiedAt: this.clock() },
        select: userSelect,
      });
      return toPublic(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        await prisma.user.update({ where: { id: userId }, data: { pendingEmail: null } });
        throw new ConflictError("That email address is already in use by another account.");
      }
      throw err;
    }
  }

  async cancelEmailChange(userId: string): Promise<AuthUser> {
    await this.requireActive(userId);
    await prisma.verificationToken.updateMany({
      where: { userId, purpose: "EMAIL_CHANGE", consumedAt: null },
      data: { consumedAt: this.clock() },
    });
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: null },
      select: userSelect,
    });
    return toPublic(updated);
  }

  // ---------------------------------------------------------------------------
  // Phone change (code goes to the VERIFIED email — there is no SMS provider,
  // so the account owner, not the number, is what gets verified)
  // ---------------------------------------------------------------------------

  async requestPhoneChange(userId: string, phone: string | null): Promise<AuthUser | VerificationChallenge> {
    const user = await this.requireActive(userId);
    if (phone === null) {
      const cleared = await prisma.user.update({
        where: { id: userId },
        data: { phone: null, pendingPhone: null },
        select: userSelect,
      });
      return toPublic(cleared);
    }
    if (phone === user.phone) {
      throw new UnprocessableError("That is already your phone number.");
    }
    const issued = await this.verification.issue(prisma, {
      userId,
      purpose: "PHONE_CHANGE",
      target: phone,
      kind: "code",
      ttlMs: CODE_TTL_MS,
      cooldownMs: CODE_RESEND_COOLDOWN_MS,
    });
    await prisma.user.update({ where: { id: userId }, data: { pendingPhone: phone } });
    await this.mailer.send({
      to: user.email,
      subject: `${this.appName}: confirm your phone number change`,
      text:
        `Enter this code in ${this.appName} to confirm your new phone number: ${issued.secret}\n\n` +
        `It expires in ${Math.round(CODE_TTL_MS / 60_000)} minutes. ` +
        `If you did not request this change, ignore this message and consider changing your password.`,
    });
    return toChallenge(issued);
  }

  async confirmPhoneChange(userId: string, code: string): Promise<AuthUser> {
    const user = await this.requireActive(userId);
    if (!user.pendingPhone) {
      throw new UnprocessableError("There is no phone change to confirm.");
    }
    const { target } = await this.verification.consumeCode(prisma, { userId, purpose: "PHONE_CHANGE", code });
    if (!target || target !== user.pendingPhone) {
      throw new UnprocessableError("That code does not match the pending phone change. Request a new one.");
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { phone: target, pendingPhone: null },
      select: userSelect,
    });
    return toPublic(updated);
  }

  // ---------------------------------------------------------------------------
  // Profile picture
  // ---------------------------------------------------------------------------

  /** Replaces (or creates) the caller's avatar after sniffing the real image type. */
  async setAvatar(userId: string, bytes: Buffer): Promise<AuthUser> {
    await this.requireActive(userId);
    if (bytes.length === 0) {
      throw new BadRequestError("Upload the image bytes as the request body.");
    }
    if (bytes.length > AVATAR_MAX_BYTES) {
      throw new UnprocessableError(`Profile pictures must be at most ${AVATAR_MAX_BYTES / (1024 * 1024)} MB.`);
    }
    const mimeType = detectImageType(bytes);
    if (!mimeType) {
      throw new UnprocessableError("Profile pictures must be a JPEG, PNG or WebP image.");
    }
    await prisma.userAvatar.upsert({
      where: { userId },
      update: { mimeType, sizeBytes: bytes.length, data: bytes },
      create: { userId, mimeType, sizeBytes: bytes.length, data: bytes },
    });
    return this.loadPublic(userId);
  }

  async deleteAvatar(userId: string): Promise<AuthUser> {
    await this.requireActive(userId);
    await prisma.userAvatar.deleteMany({ where: { userId } });
    return this.loadPublic(userId);
  }

  /**
   * Reads a user's avatar for display. Allowed for the owner and for ADMIN
   * (the Admin console shows driver profiles); anyone else gets 403 rather
   * than 404 so the check is explicit.
   */
  async getAvatar(
    requester: { id: string; role: "USER" | "ADMIN" },
    userId: string
  ): Promise<{ mimeType: string; data: Buffer; updatedAt: Date }> {
    if (requester.id !== userId && requester.role !== "ADMIN") {
      throw new ForbiddenError();
    }
    const avatar = await prisma.userAvatar.findUnique({ where: { userId } });
    if (!avatar) {
      throw new NotFoundError("No profile picture.");
    }
    return { mimeType: avatar.mimeType, data: Buffer.from(avatar.data), updatedAt: avatar.updatedAt };
  }

  private async loadPublic(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    return toPublic(user);
  }
}
