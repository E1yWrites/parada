import { loadEnv } from "./config/env";
import { createApp } from "./app";
import { prisma } from "@parada/database";

async function main() {
  const env = loadEnv();
  const app = createApp();

  const server = app.listen(env.port, env.host, () => {
    console.log(`[api] PARADA API listening on http://${env.host}:${env.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
