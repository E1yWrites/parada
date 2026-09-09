"use strict";
/*
 * PARADA local development database (embedded Postgres, no root/Docker).
 *
 * Starts an embedded PostgreSQL 18 cluster on the configured port. Data
 * persists in `.embedded-pg/`.
 *
 * The postmaster is started through `pg_ctl`, so it is INDEPENDENT of this
 * script: it survives this process exiting, and it is not in this process's
 * console/process group. See scripts/lib/cluster.cjs for why that matters —
 * previously the cluster was a child of this script and a console control
 * event aimed at the tooling crash-shut-down the whole server.
 *
 * Usage:
 *   npm run db:dev   -w @parada/database  (start, stay attached, stop on Ctrl+C)
 *   npm run db:start -w @parada/database  (start, return once ready, leave running)
 *   npm run db:stop  -w @parada/database  (stop cleanly)
 */
const fs = require("node:fs");
const path = require("node:path");
const { clusterStatus, startCluster, stopCluster } = require("./lib/cluster.cjs");
const { ensureDatabase, portOpen, sleep, waitForPostgres } = require("./lib/pg-ready.cjs");

const DATA_DIR = path.join(__dirname, "..", ".embedded-pg", "data");
const STATE_DIR = path.join(__dirname, "..", ".embedded-pg");
const LOG_FILE = path.join(STATE_DIR, "db.log");
const LOCK_FILE = path.join(STATE_DIR, "start.lock");
const STOP_FILE = path.join(STATE_DIR, "stop.request");

const PORT = Number(process.env.DB_PORT ?? "5442");
const USER = process.env.DB_USER ?? "parada";
const PASSWORD = process.env.DB_PASSWORD ?? "changeme";
const CONNECT = { port: PORT, user: USER, password: PASSWORD };

const isBackground = process.env.BACKGROUND === "1";

/**
 * Serialise starts. Two concurrent `db:start` calls both saw a closed port and
 * both ran initdb/start against the same data directory, which is how the
 * cluster ended up half-initialised. The lock is stale-tolerant so a killed
 * launcher cannot wedge the workflow permanently.
 */
function acquireLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
    // Stale lock (older than 2 minutes) — the owner died without cleaning up.
    try {
      const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
      if (age > 120_000) {
        fs.rmSync(LOCK_FILE, { force: true });
        return acquireLock();
      }
    } catch {
      return acquireLock();
    }
    return false;
  }
}

function releaseLock() {
  fs.rmSync(LOCK_FILE, { force: true });
}

/**
 * Bring the cluster up and make sure the application database exists.
 * Idempotent: a cluster that is already serving queries is left alone.
 *
 * Returns true when this call actually started the server (so the caller knows
 * whether it owns the cluster's lifetime).
 */
async function ensureClusterReady() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // A stop request left over from a previous run must not stop this one.
  fs.rmSync(STOP_FILE, { force: true });

  // Readiness, not liveness: the postmaster accepts sockets during startup and
  // crash recovery while rejecting every query with 57P03.
  if (await portOpen(PORT)) {
    const ready = await waitForPostgres({ ...CONNECT, database: "parada", timeoutMs: 90_000 });
    if (ready) {
      console.log(
        `embedded postgres already running and accepting queries on 127.0.0.1:${PORT} — nothing to do.`
      );
      return false;
    }
    const status = await clusterStatus(DATA_DIR);
    if (!status.running) {
      console.error(
        `something other than the PARADA development cluster is listening on 127.0.0.1:${PORT}. Free the port and retry.`
      );
    } else {
      console.error(
        `the cluster on 127.0.0.1:${PORT} never became query-ready. Stop it (npm run db:stop -w @parada/database) and retry — see ${path.relative(process.cwd(), LOG_FILE)}.`
      );
    }
    process.exit(1);
  }

  if (!acquireLock()) {
    // Another launcher is mid-start. Wait for its cluster rather than racing it.
    console.log("another embedded postgres start is in progress — waiting for it...");
    const ready = await waitForPostgres({ ...CONNECT, database: "parada", timeoutMs: 120_000 });
    if (!ready) {
      process.exit(1);
    }
    return false;
  }

  try {
    // The port was closed but pg_ctl may still believe the cluster is up, e.g.
    // after a crash left a stale postmaster.pid behind. Clear that first so the
    // start below is not rejected outright.
    const status = await clusterStatus(DATA_DIR);
    if (status.running) {
      await stopCluster({ dataDir: DATA_DIR });
    }

    await startCluster({
      dataDir: DATA_DIR,
      port: PORT,
      logFile: LOG_FILE,
      user: USER,
      password: PASSWORD,
    });

    // pg_ctl -w proves the postmaster is accepting connections; this proves the
    // cluster answers a real query, which is the gate `prisma migrate deploy`
    // was previously missing.
    await waitForPostgres({
      ...CONNECT,
      database: "postgres",
      timeoutMs: 120_000,
      throwOnTimeout: true,
    });

    const created = await ensureDatabase({ ...CONNECT, database: "postgres" }, "parada");
    if (created) {
      console.log('created database "parada".');
    }
    await waitForPostgres({ ...CONNECT, database: "parada", timeoutMs: 60_000, throwOnTimeout: true });
  } finally {
    releaseLock();
  }

  console.log(`embedded postgres ready on 127.0.0.1:${PORT} (user=${USER}, db=parada)`);
  console.log(`data dir: ${DATA_DIR}`);
  return true;
}

async function main() {
  await ensureClusterReady();

  if (isBackground) {
    // The postmaster is independent of this process, so there is nothing left
    // to supervise. Returning here is what removes the old orphaned-launcher
    // class of bug: no long-lived Node process is left holding a stale handle
    // on a cluster it may no longer own.
    return;
  }

  // Foreground (`db:dev`): stay attached and shut the cluster down on exit, so
  // Ctrl+C leaves the data directory cleanly shut down rather than in a state
  // that forces crash recovery on the next start.
  console.log("Press Ctrl+C to stop the database.");

  let stopping = false;
  const shutdown = async (code) => {
    if (stopping) {
      return;
    }
    stopping = true;
    const result = await stopCluster({ dataDir: DATA_DIR }).catch((error) => ({
      stopped: false,
      detail: String(error.message ?? error),
    }));
    if (!result.stopped) {
      console.error(`could not stop the cluster cleanly: ${result.detail ?? "unknown error"}`);
    }
    fs.rmSync(STOP_FILE, { force: true });
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  // Cross-platform stop channel: Windows has no real SIGTERM delivery
  // (process.kill is TerminateProcess, so no handler ever runs), which is why
  // stop-dev-db.cjs can also ask via a file.
  setInterval(() => {
    if (fs.existsSync(STOP_FILE)) {
      void shutdown(0);
    }
  }, 300);
}

main().catch(async (err) => {
  releaseLock();
  console.error("failed to start embedded postgres:", err.message ?? err);
  await sleep(50);
  process.exit(1);
});
