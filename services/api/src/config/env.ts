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

  return {
    port: Number(process.env["PORT"] ?? "4000"),
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
    cameraApiKey: process.env["CAMERA_API_KEY"] ?? null,
    ocrPlateConfidenceThreshold,
  };
}
