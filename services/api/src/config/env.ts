import "dotenv/config";

export interface Env {
  port: number;
  databaseUrl: string;
  nodeEnv: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): Env {
  return {
    port: Number(process.env["PORT"] ?? "4000"),
    databaseUrl: required("DATABASE_URL"),
    nodeEnv: process.env["NODE_ENV"] ?? "development",
  };
}
