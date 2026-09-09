"use strict";
/*
 * Stop the PARADA development database.
 *
 * Uses `pg_ctl stop -m fast`, PostgreSQL's own clean shutdown: it disconnects
 * clients and writes a shutdown checkpoint. That is what keeps the NEXT start
 * out of crash recovery — and therefore out of the window where every query is
 * rejected with `FATAL: the database system is starting up` (SQLSTATE 57P03),
 * which is what `prisma migrate deploy` kept losing to.
 *
 * The previous implementation went through embedded-postgres, whose Windows
 * stop path is `taskkill /pid <pid> /f /t` — a forced termination that ALWAYS
 * left the data directory needing recovery.
 *
 * A stop-request file is still written first, so a foreground `db:dev` session
 * (which owns its own cluster lifetime) shuts itself down rather than being
 * stopped from underneath.
 */
const fs = require("node:fs");
const path = require("node:path");
const { clusterStatus, stopCluster } = require("./lib/cluster.cjs");
const { portOpen, sleep } = require("./lib/pg-ready.cjs");

const STATE_DIR = path.join(__dirname, "..", ".embedded-pg");
const DATA_DIR = path.join(STATE_DIR, "data");
const LEGACY_PID_FILE = path.join(STATE_DIR, "server.pid");
const STOP_FILE = path.join(STATE_DIR, "stop.request");

const PORT = Number(process.env.DB_PORT ?? "5442");

async function waitForPortClosed(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portOpen(PORT, "127.0.0.1", 500))) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

function cleanupState() {
  // server.pid tracked the old Node launcher process, which no longer exists.
  // Remove any leftover so nothing later reads a PID that Windows may have
  // recycled onto an unrelated process.
  fs.rmSync(LEGACY_PID_FILE, { force: true });
  fs.rmSync(STOP_FILE, { force: true });
}

async function main() {
  const listening = await portOpen(PORT);
  const status = await clusterStatus(DATA_DIR);

  if (!listening && !status.running) {
    cleanupState();
    console.log("No embedded postgres listening — nothing to stop.");
    return;
  }

  // Ask a foreground `db:dev` session to stop itself first; it owns the
  // cluster's lifetime and will run the same clean shutdown.
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STOP_FILE, String(Date.now()));
  console.log("Requested a clean shutdown of the embedded postgres cluster...");

  if (await waitForPortClosed(5_000)) {
    cleanupState();
    console.log("Embedded postgres stopped cleanly.");
    return;
  }

  // Nothing was attached (the usual `db:start` case) — stop it directly.
  const result = await stopCluster({ dataDir: DATA_DIR });
  if (!result.stopped) {
    cleanupState();
    console.error(`Could not stop the cluster cleanly: ${result.detail ?? "unknown error"}`);
    process.exit(1);
  }

  await waitForPortClosed(15_000);
  cleanupState();

  if (await portOpen(PORT)) {
    console.error(
      `Something is still listening on 127.0.0.1:${PORT}. Check ${path.relative(process.cwd(), path.join(STATE_DIR, "db.log"))}.`
    );
    process.exit(1);
  }
  console.log("Embedded postgres stopped.");
}

main().catch((error) => {
  console.error("failed to stop embedded postgres:", error.message ?? error);
  process.exit(1);
});
