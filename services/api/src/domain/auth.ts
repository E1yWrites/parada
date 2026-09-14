import * as argon2 from "argon2";
import { prisma, Prisma } from "@parada/database";
import type { AuthUser, VerificationChallenge } from "@parada/types";
import {
  ConflictError,
  EmailNotVerifiedError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
  VerificationError,
} from "../http/errors";
import { TokenService, type TokenConfig } from "./token";
import { ConsoleMailer, type Mailer } from "../mail/mailer";
import {
  CODE_RESEND_COOLDOWN_MS,
  CODE_TTL_MS,
  RESET_RESEND_COOLDOWN_MS,
  RESET_TOKEN_TTL_MS,
  VerificationService,
} from "./verification";

/** @deprecated name kept for existing imports; the wire shape is `AuthUser`. */
export type PublicUser = AuthUser;

/** Selected on every user read so the response can be built without the hash. */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  pendingEmail: true,
  pendingPhone: true,
  createdAt: true,
  avatar: { select: { updatedAt: true } },
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Never includes passwordHash — used for every user-bearing API response. */
export function toPublic(user: UserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    phone: user.phone,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    pendingEmail: user.pendingEmail,
    pendingPhone: user.pendingPhone,
    avatarUpdatedAt: user.avatar ? user.avatar.updatedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

function toChallenge(issued: { expiresAt: Date; resendAvailableAt: Date }): VerificationChallenge {
  return {
    expiresAt: issued.expiresAt.toISOString(),
    resendAvailableAt: issued.resendAvailableAt.toISOString(),
  };
}

// argon2id hash of an unguessable value, verified against when the account
// does not exist so login timing does not reveal registered emails.
const FALLBACK_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$ZMFn9amWz5C6kxt+6UnsoQ$v8QkUBjpMaBjMwDq5/Dc8FNBEfo2QQFxsjXsQ3ZRrjA";

export interface AuthServiceDeps {
  mailer?: Mailer;
  verification?: VerificationService;
  /** Establishment name used in mail subjects/bodies. */
  appName?: string;
  /** Mobile deep-link scheme embedded in password-reset mail. */
  mobileScheme?: string;
  clock?: () => Date;
}

/**
 * Credentials, sessions and the verification flows that gate them.
 *
 * Verification state lives on the user row (`emailVerifiedAt`,
 * `passwordChangedAt`) and in `verification_tokens` (see VerificationService);
 * the JWT is unchanged. Login is the only place that decides whether an
 * account is usable, and it refuses unverified accounts with
 * EMAIL_NOT_VERIFIED so a client can resume verification instead of
 * registering again.
 */
export class AuthService {
  readonly tokens: TokenService;
  readonly mailer: Mailer;
  readonly verification: VerificationService;
  private readonly appName: string;
  private readonly mobileScheme: string;
  private readonly clock: () => Date;

  constructor(config: TokenConfig, deps: AuthServiceDeps = {}) {
    this.tokens = new TokenService(config);
    this.mailer = deps.mailer ?? new ConsoleMailer();
    this.verification = deps.verification ?? new VerificationService(config.secret, deps.clock);
    this.appName = deps.appName ?? "PARADA";
    this.mobileScheme = deps.mobileScheme ?? "parada";
    this.clock = deps.clock ?? (() => new Date());
  }

  // ---------------------------------------------------------------------------
  // Registration + email verification
  // ---------------------------------------------------------------------------

  async register(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ user: AuthUser; verification: VerificationChallenge }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    let user: UserRecord;
    try {
      user = await prisma.user.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash,
          // Registration always creates a USER. Role is not user-suppliable;
          // ADMIN is granted only via explicit administrative action/seed.
          role: "USER",
          status: "ACTIVE",
          emailVerifiedAt: null,
        },
        select: userSelect,
      });
    } catch (err) {
      // Duplicate email -> Prisma P2002 on the email unique constraint.
      const code = (err as { code?: string })?.code;
      if (code === "P2002") {
        throw new ConflictError(`An account with email '${email}' already exists.`);
      }
      throw err;
    }

    const challenge = await this.sendEmailVerification(user.id, user.email);
    return { user: toPublic(user), verification: challenge };
  }

  /**
   * Issues a fresh 6-digit code and mails it. The row is created before the
   * mail goes out; a transport failure surfaces to the caller (no fake
   * delivery) and the code stays valid so a resend simply issues another.
   */
  private async sendEmailVerification(userId: string, email: string): Promise<VerificationChallenge> {
    const issued = await this.verification.issue(prisma, {
      userId,
      purpose: "EMAIL_VERIFY",
      kind: "code",
      ttlMs: CODE_TTL_MS,
      cooldownMs: CODE_RESEND_COOLDOWN_MS,
    });
    await this.mailer.send({
      to: email,
      subject: `${this.appName}: your verification code`,
      text:
        `Your ${this.appName} verification code is ${issued.secret}.\n\n` +
        `It expires in ${Math.round(CODE_TTL_MS / 60_000)} minutes. ` +
        `If you did not create a ${this.appName} account, ignore this message.`,
    });
    return toChallenge(issued);
  }

  /** Resend for an unverified account. Generic response: never reveals whether the email exists. */
  async resendVerification(emailRaw: string): Promise<VerificationChallenge | null> {
    const email = emailRaw.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true, status: true },
    });
    if (!user || user.emailVerifiedAt || user.status !== "ACTIVE") {
      return null;
    }
    return this.sendEmailVerification(user.id, user.email);
  }

  async verifyEmail(input: { email: string; code: string }): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: userSelect });
    if (!user || user.emailVerifiedAt) {
      // Same error as a wrong code: the endpoint must not confirm which
      // addresses exist or are already verified.
      throw new VerificationError("CODE_INVALID", "That code is not valid. Request a new one.");
    }
    // Consumed outside a transaction on purpose: a wrong guess must persist
    // its attempt count even though the request fails.
    await this.verification.consumeCode(prisma, { userId: user.id, purpose: "EMAIL_VERIFY", code: input.code });
    const verified = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: this.clock() },
      select: userSelect,
    });
    return toPublic(verified);
  }

  // ---------------------------------------------------------------------------
  // Login / logout
  // ---------------------------------------------------------------------------

  async login(input: { email: string; password: string }): Promise<{ user: AuthUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { ...userSelect, passwordHash: true, tokenVersion: true },
    });
    // Use a single generic message so responses do not reveal whether an email
    // exists. Verify against a dummy hash when the user is absent to keep
    // timing roughly constant and prevent trivial user-enumeration.
    const stored = user?.passwordHash ?? FALLBACK_HASH;
    let valid = false;
    try {
      valid = await argon2.verify(stored, input.password);
    } catch {
      valid = false;
    }

    if (!user || user.status !== "ACTIVE" || !valid) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    if (!user.emailVerifiedAt) {
      // Correct credentials on an unverified account: hand the client what it
      // needs to continue verification. A fresh code is issued when the
      // cooldown allows; otherwise the client is told when it may resend.
      let challenge: VerificationChallenge | null = null;
      try {
        challenge = await this.sendEmailVerification(user.id, user.email);
      } catch (err) {
        if (!(err instanceof TooManyRequestsError)) throw err;
      }
      throw new EmailNotVerifiedError({ email: user.email, verification: challenge });
    }

    const { token } = this.tokens.sign({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });
    const { passwordHash: _hash, tokenVersion: _tv, ...record } = user;
    return { user: toPublic(record), token };
  }

  /** Invalidates the given token server-side (logout). */
  async revoke(jti: string): Promise<void> {
    await prisma.revokedToken.upsert({
      where: { tokenId: jti },
      update: {},
      create: { tokenId: jti },
    });
  }

  async isRevoked(jti: string): Promise<boolean> {
    const found = await prisma.revokedToken.findUnique({ where: { tokenId: jti } });
    return found !== null;
  }

  /**
   * Per-request session check used by the auth middleware: the account must
   * still be ACTIVE and the token must have been issued after the last
   * password change (a change/reset invalidates every earlier session).
   */
  async isSessionValid(claims: { sub: string; tokenVersion: number }): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { status: true, tokenVersion: true },
    });
    if (!user || user.status !== "ACTIVE") return false;
    return user.tokenVersion === claims.tokenVersion;
  }

  /** Loads and returns the current authenticated user or throws. */
  async loadUser(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Authentication required.");
    }
    return toPublic(user);
  }

  /** Validates a password meets the minimum policy. Throws Unprocessable on failure. */
  validatePassword(password: string): void {
    if (typeof password !== "string" || password.length < 8) {
      throw new UnprocessableError("Password must be at least 8 characters long.");
    }
    if (password.length > 128) {
      throw new UnprocessableError("Password must be at most 128 characters long.");
    }
  }

  // ---------------------------------------------------------------------------
  // Password change (authenticated) and reset (forgot password)
  // ---------------------------------------------------------------------------

  /**
   * Re-hashes with argon2id, stamps `passwordChangedAt` (every earlier token
   * becomes invalid) and returns a fresh token so the current device stays
   * signed in. The plaintext passwords are never persisted or logged.
   */
  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string }
  ): Promise<{ user: AuthUser; token: string }> {
    this.validatePassword(input.newPassword);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, passwordHash: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Authentication required.");
    }
    let valid = false;
    try {
      valid = await argon2.verify(user.passwordHash, input.currentPassword);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnprocessableError("Your current password is incorrect.");
    }
    if (input.currentPassword === input.newPassword) {
      throw new UnprocessableError("Choose a password you have not used before.");
    }
    const updated = await this.applyNewPassword(user.id, input.newPassword);
    return this.freshSession(updated);
  }

  /** Always 202-shaped for the caller: silently no-ops for unknown/inactive accounts. */
  async forgotPassword(emailRaw: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return;
    }
    let issued;
    try {
      issued = await this.verification.issue(prisma, {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        kind: "token",
        ttlMs: RESET_TOKEN_TTL_MS,
        cooldownMs: RESET_RESEND_COOLDOWN_MS,
      });
    } catch (err) {
      // Inside the cooldown: keep the response generic (no enumeration), the
      // earlier token is still live and already in the user's inbox.
      if (err instanceof TooManyRequestsError) return;
      throw err;
    }
    await this.mailer.send({
      to: user.email,
      subject: `${this.appName}: reset your password`,
      text:
        `Open this link on your phone to choose a new ${this.appName} password:\n\n` +
        `${this.mobileScheme}://reset-password?token=${issued.secret}\n\n` +
        `Or enter this reset code in the app: ${issued.secret}\n\n` +
        `The link expires in ${Math.round(RESET_TOKEN_TTL_MS / 60_000)} minutes and works once. ` +
        `If you did not ask to reset your password, ignore this message; your password is unchanged.`,
    });
  }

  /**
   * Consumes the reset token, sets the new password and invalidates every
   * existing session. Receiving the mail proves control of the address, so an
   * unverified account becomes verified here too.
   */
  async resetPassword(input: { token: string; newPassword: string }): Promise<AuthUser> {
    this.validatePassword(input.newPassword);
    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    const updated = await prisma.$transaction(async (tx) => {
      const { userId } = await this.verification.consumeToken(tx, {
        purpose: "PASSWORD_RESET",
        token: input.token,
      });
      const now = this.clock();
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      });
      return tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          tokenVersion: { increment: 1 },
          ...(current.emailVerifiedAt ? {} : { emailVerifiedAt: now }),
        },
        select: userSelect,
      });
    });
    return toPublic(updated);
  }

  private async applyNewPassword(userId: string, newPassword: string) {
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: this.clock(), tokenVersion: { increment: 1 } },
      select: { ...userSelect, tokenVersion: true },
    });
  }

  private freshSession(user: UserRecord & { tokenVersion: number }): { user: AuthUser; token: string } {
    const { token } = this.tokens.sign({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });
    return { user: toPublic(user), token };
  }
}
