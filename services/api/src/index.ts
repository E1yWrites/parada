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
    // Stop accepting connections; exit once every open one has finished.
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Idle keep-alive sockets never complete a request on their own, and open
    // SSE streams (/realtime/stream) count as active for as long as the client
    // stays subscribed, so close() alone would wait until the platform's
    // SIGKILL. Drop idle sockets now, end the rest after a short grace period
    // (clients reconnect and resync), and never outlive a 10 s grace window.
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 5_000).unref();
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
