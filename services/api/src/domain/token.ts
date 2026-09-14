import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { Role } from "@parada/types";

export interface TokenConfig {
  secret: string;
  issuer: string;
  expiresIn: string;
}

const SIGN_OPTIONS: SignOptions = {
  algorithm: "HS256",
};

export interface AuthToken {
  token: string;
  jti: string;
}

export interface TokenClaims {
  sub: string;
  jti: string;
  role: Role;
  /** Password/session generation the token was issued under (`tv` claim; 0 when absent). */
  tokenVersion: number;
}

export class TokenService {
  constructor(private readonly config: TokenConfig) {}

  sign(user: { id: string; role: Role; tokenVersion?: number }): AuthToken {
    const jti = randomUUID();
    const options: SignOptions = {
      ...SIGN_OPTIONS,
      issuer: this.config.issuer,
      expiresIn: this.config.expiresIn as SignOptions["expiresIn"],
    };
    const token = jwt.sign(
      { sub: user.id, jti, role: user.role, tv: user.tokenVersion ?? 0 },
      this.config.secret,
      options
    );
    return { token, jti };
  }

  /**
   * Verifies the token (signature, expiry, issuer) and returns its claims.
   * Throws on invalid/expired tokens.
   */
  verify(token: string): TokenClaims {
    const payload = jwt.verify(token, this.config.secret, {
      algorithms: ["HS256"],
      issuer: this.config.issuer,
    });
    if (typeof payload !== "object" || payload === null) {
      throw new jwt.JsonWebTokenError("Invalid token payload.");
    }
    const { sub, jti, role, tv } = payload as {
      sub?: unknown;
      jti?: unknown;
      role?: unknown;
      tv?: unknown;
    };
    if (typeof sub !== "string" || typeof jti !== "string") {
      throw new jwt.JsonWebTokenError("Token is missing required claims.");
    }
    const validRole: Role = role === "ADMIN" ? "ADMIN" : "USER";
    const tokenVersion = typeof tv === "number" && Number.isInteger(tv) && tv >= 0 ? tv : 0;
    return { sub, jti, role: validRole, tokenVersion };
  }
}
