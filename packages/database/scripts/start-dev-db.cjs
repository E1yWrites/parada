"use strict";
/*
 * PARADA local development database (embedded Postgres, no root/Docker).
 *
 * Starts an embedded PostgreSQL 18 cluster on the configured port and keeps it
 * alive for the lifetime of this process. Data persists in `.embedded-pg/`.
 *
 * Usage:
 *   npm run db:dev -w @parada/database   (start, foreground)
 *   npm run db:start -w @parada/database (start, background, waits for ready)
 *   npm run db:stop -w @parada/database  (stop a background instance cleanly)
 */
const fs = require("node:fs");
const path = require("node:path");
const EmbeddedPostgres = require("embedded-postgres").default;
const { ensureDatabase, portOpen, sleep, waitForPostgres } = require("./lib/pg-ready.cjs");

const DATA_DIR = path.join(__dirname, "..", ".embedded-pg", "data");
const STATE_DIR = path.join(__dirname, "..", ".embedded-pg");
const PID_FILE = path.join(STATE_DIR, "server.pid");
const LOCK_FILE = path.join(STATE_DIR, "start.lock");
const STOP_FILE = path.join(STATE_DIR, "stop.request");

const PORT = Number(process.env.DB_PORT ?? "5442");
const USER = process.env.DB_USER ?? "parada";
const PASSWORD = process.env.DB_PASSWORD ?? "changeme";
const CONNECT = { port: PORT, user: USER, password: PASSWORD };

const isBackground = process.env.BACKGROUND === "1";

function writePid() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function clearPid() {
  fs.rmSync(PID_FILE, { force: true });
}

/**
 * Serialise starts. Two concurrent `db:start` calls both saw a closed port and
 * both ran initdb/start against the same data directory, which is how the
 * cluster ended up half-initialised. The lock is stale-tolerant so a killed
 * launcher cannot wedge the workflow permanently.
 */
function acquireLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
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
          continue;
        }
      } catch {
        continue;
      }
      return false;
    }
  }
  return false;
}

function releaseLock() {
  fs.rmSync(LOCK_FILE, { force: true });
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // A stop request left over from a previous run must not stop this one.
  fs.rmSync(STOP_FILE, { force: true });

  // Readiness, not liveness: the postmaster accepts sockets during startup and
  // crash recovery while rejecting every query with 57P03.
  if (await portOpen(PORT)) {
    const ready = await waitForPostgres({ ...CONNECT, database: "parada", timeoutMs: 90_000 });
    if (ready) {
      console.log(`embedded postgres already running and accepting queries on 127.0.0.1:${PORT} — nothing to do.`);
      process.exit(0);
    }
    console.error(
      `something is listening on 127.0.0.1:${PORT} but it never became query-ready. Stop it (npm run db:stop -w @parada/database) and retry.`
    );
    process.exit(1);
  }

  if (!acquireLock()) {
    // Another launcher is mid-start. Wait for its cluster rather than racing it.
    console.log("another embedded postgres start is in progress — waiting for it...");
    const ready = await waitForPostgres({ ...CONNECT, database: "parada", timeoutMs: 120_000 });
    process.exit(ready ? 0 : 1);
  }

  let pg;
  try {
    pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: USER,
      password: PASSWORD,
      port: PORT,
      persistent: true,
      onError: () => undefined,
    });

    // Only initialise (initdb) on the first run. Once the cluster is on disk this
    // must be skipped, otherwise initdb fails with "directory exists but is not
    // empty" on every subsequent restart.
    const dataReady = fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
    if (!dataReady) {
      await pg.initialise();
    }
    await pg.start();

    // Wait for the cluster to finish startup/recovery BEFORE touching it. This
    // is the gate that `prisma migrate deploy` was previously missing.
    const ready = await waitForPostgres({
      ...CONNECT,
      database: "postgres",
      timeoutMs: 120_000,
      throwOnTimeout: true,
    });
    if (!ready) {
      throw new Error("embedded postgres did not become query-ready in time.");
    }

    // NOTE: deliberately NOT pg.createDatabase() — that helper only closes its
    // client on success, so the "already exists" path (every run after the
    // first) leaked a live server backend for the process lifetime. When the
    // launcher's console was closed, that backend died abnormally and the
    // postmaster crash-shut-down the whole cluster. ensureDatabase always
    // closes its connection. See scripts/lib/pg-ready.cjs.
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
  writePid();
  console.log(`pid: ${process.pid}`);

  let stopping = false;
  const shutdown = async (code) => {
    if (stopping) {
      return;
    }
    stopping = true;
    // A clean pg.stop() is what avoids crash recovery (and the transient
    // "the database system is starting up") on the NEXT start.
    try {
      await pg.stop();
    } catch {
      /* best effort — the cluster may already be gone */
    }
    clearPid();
    fs.rmSync(STOP_FILE, { force: true });
    process.exit(code);
  };

  process.on("SIGTERM", () => void shutdown(0));
  if (isBackground) {
    // Ctrl+C in the console that launched the background instance must not take
    // the shared development database down with it.
    process.on("SIGINT", () => undefined);
    process.on("SIGHUP", () => undefined);
    // Cross-platform stop channel: Windows has no real SIGTERM delivery
    // (process.kill is TerminateProcess, so no handler ever runs), which is why
    // stop-dev-db.cjs asks via a file and this loop honours it.
    setInterval(() => {
      if (fs.existsSync(STOP_FILE)) {
        void shutdown(0);
      }
    }, 300).unref();
    // Keep the event loop alive without an unref'd-only timer set.
    setInterval(() => undefined, 1 << 30);
  } else {
    process.on("SIGINT", () => void shutdown(0));
    setInterval(() => {
      if (fs.existsSync(STOP_FILE)) {
        void shutdown(0);
      }
    }, 300);
  }
}

main().catch(async (err) => {
  releaseLock();
  console.error("failed to start embedded postgres:", err);
  await sleep(50);
  process.exit(1);
});
