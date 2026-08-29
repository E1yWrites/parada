import "dotenv/config";

export interface Env {
  port: number;
  databaseUrl: string;
  nodeEnv: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtExpiresIn: string;
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
  return {
    port: Number(process.env["PORT"] ?? "4000"),
    databaseUrl: required("DATABASE_URL"),
    nodeEnv,
    // JWT secret is REQUIRED in every environment to avoid accidentally
    // shipping an unguessable-but-hardcoded default. Copy .env.example to .env.
    jwtSecret: required("JWT_SECRET"),
    jwtIssuer: process.env["JWT_ISSUER"] ?? "parada-api",
    jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "1d",
  };
}
