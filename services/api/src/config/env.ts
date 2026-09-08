import "dotenv/config";
import { DEFAULT_OCR_CONFIDENCE_THRESHOLD } from "@parada/config";

export interface Env {
  port: number;
  host: string;
  databaseUrl: string;
  nodeEnv: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtExpiresIn: string;
  cameraApiKey: string | null;
  ocrPlateConfidenceThreshold: number;
  /** Attempts per fixed 60s window (per key) for credential endpoints. */
  authRateLimitPerMinute: number;
  /** Events per fixed 60s window, per trusted camera identifier. */
  cameraEventRateLimitPerMinute: number;
  /** Admin mutation requests per fixed 60s window, per authenticated admin. */
  adminRateLimitPerMinute: number;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * An env var that is present but blank means "not configured", not "configured
 * to the empty string". `.env.example` ships `CAMERA_API_KEY=""`, so a plain
 * `?? null` produced `""` — which is non-null, so the event endpoint demanded a
 * key that no caller could ever match and rejected every camera event with 401
 * while appearing unconfigured.
 */
function optionalSecret(name: string): string | null {
  const value = process.env[name];
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): Env {
  const nodeEnv = process.env["NODE_ENV"] ?? "development";

  // OCR plate confidence threshold [0..1]. Detected plates whose OCR confidence
  // falls below this value are not treated as a reliable vehicle identity (no
  // vehicle match, no session), though the physical occupancy change is kept.
  const thresholdRaw = process.env["OCR_PLATE_CONFIDENCE_THRESHOLD"];
  let ocrPlateConfidenceThreshold =
    thresholdRaw !== undefined ? Number(thresholdRaw) : DEFAULT_OCR_CONFIDENCE_THRESHOLD;
  if (
    !Number.isFinite(ocrPlateConfidenceThreshold) ||
    ocrPlateConfidenceThreshold < 0 ||
    ocrPlateConfidenceThreshold > 1
  ) {
    ocrPlateConfidenceThreshold = DEFAULT_OCR_CONFIDENCE_THRESHOLD;
  }

  const env: Env = {
    port: Number(process.env["PORT"] ?? "4100"),
    host: process.env["HOST"] ?? "0.0.0.0",
    databaseUrl: required("DATABASE_URL"),
    nodeEnv,
    // JWT secret is REQUIRED in every environment to avoid accidentally
    // shipping an unguessable-but-hardcoded default. Copy .env.example to .env.
    jwtSecret: required("JWT_SECRET"),
    jwtIssuer: process.env["JWT_ISSUER"] ?? "parada-api",
    jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "1d",
    // Shared API key that the camera/vision service must present via the
    // X-API-Key header on the event-ingestion endpoint. Null (not set) means
    // the endpoint is open — acceptable only in trusted development; set one in
    // any real deployment.
    cameraApiKey: optionalSecret("CAMERA_API_KEY"),
    ocrPlateConfidenceThreshold,
    // Fixed-window rate budgets. Guards against credential brute-forcing,
    // camera event flooding, and admin mutation abuse. The limiter is
    // in-memory and per-process (see http/rateLimit.ts); these defaults are
    // deliberately generous so shared (NAT) egress and busy camera feeds keep
    // working.
    authRateLimitPerMinute: optionalInt("AUTH_RATE_LIMIT", 10),
    cameraEventRateLimitPerMinute: optionalInt("CAMERA_EVENT_RATE_LIMIT", 300),
    adminRateLimitPerMinute: optionalInt("ADMIN_RATE_LIMIT", 120),
  };

  // The dev-only "open endpoint" fallback in eventsRouter (see its comment)
  // must never reach a real deployment, where anyone could inject fabricated
  // occupancy events.
  if (env.nodeEnv === "production" && !env.cameraApiKey) {
    throw new Error(
      "Missing required environment variable: CAMERA_API_KEY (required outside development)."
    );
  }

  return env;
}
