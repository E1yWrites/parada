import * as argon2 from "argon2";
import { prisma } from "@parada/database";
import type { Role } from "@parada/types";
import { ConflictError, UnauthorizedError, UnprocessableError } from "../http/errors";
import { TokenService, type TokenConfig } from "./token";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
}

/** Never includes passwordHash — used for every user-bearing API response. */
function toPublic(user: {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

export class AuthService {
  readonly tokens: TokenService;

  constructor(config: TokenConfig) {
    this.tokens = new TokenService(config);
  }

  async register(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    let user;
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
        },
      });
    } catch (err) {
      // Duplicate email -> Prisma P2002 on the email unique constraint.
      const code = (err as { code?: string })?.code;
      if (code === "P2002") {
        throw new ConflictError(`An account with email '${email}' already exists.`);
      }
      throw err;
    }

    const { token } = this.tokens.sign({ id: user.id, role: user.role });
    return { user: toPublic(user), token };
  }

  async login(input: { email: string; password: string }): Promise<{ user: PublicUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Use a single generic message so responses do not reveal whether an email
    // exists. Verify against a dummy hash when the user is absent to keep
    // timing roughly constant and prevent trivial user-enumeration.
    const fallbackHash =
      "$argon2id$v=19$m=65536,p=4,t=3$ZMFn9amWz5C6kxt+6UnsoQ$v8QkUBjpMaBjMwDq5/Dc8FNBEfo2QQFxsjXsQ3ZRrjA";
    const stored = user?.passwordHash ?? fallbackHash;
    let valid = false;
    try {
      valid = await argon2.verify(stored, input.password);
    } catch {
      valid = false;
    }

    if (!user || user.status !== "ACTIVE" || !valid) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const { token } = this.tokens.sign({ id: user.id, role: user.role });
    return { user: toPublic(user), token };
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

  /** Loads and returns the current authenticated user or throws. */
  async loadUser(userId: string): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
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
  }
}
