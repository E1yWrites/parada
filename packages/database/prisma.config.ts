import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads DATABASE_URL from schema.prisma or loads .env by
// itself. The npm scripts pass DATABASE_URL explicitly (cross-env); `generate`
// needs no database, so a missing URL must not fail the build.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node src/seed/index.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
