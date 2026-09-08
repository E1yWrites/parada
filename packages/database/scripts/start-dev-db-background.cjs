"use strict";
/*
 * Cross-platform "background start" wrapper for start-dev-db.cjs.
 *
 * Replaces the old `mkdir -p .embedded-pg && BACKGROUND=1 nohup node
 * scripts/start-dev-db.cjs > .embedded-pg/db.log 2>&1 &` shell chain (Linux/WSL
 * only) with an equivalent that works on Windows, macOS, and Linux via Node's
 * own detached-process support.
 *
 * IMPORTANT: this command does not return until the cluster actually answers a
 * query. `npm run db:prepare` runs `prisma migrate deploy` on the very next
 * line, and PostgreSQL accepts TCP connections while it is still starting up —
 * so a fire-and-forget spawn made the first migration fail with
 * `FATAL: the database system is starting up` (or, once the postmaster had
 * crash-shut-down, `Can't reach database server at 127.0.0.1:5442`).
 *
 * Usage:
 *   npm run db:start -w @parada/database
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { portOpen, waitForPostgres } = require("./lib/pg-ready.cjs");

const STATE_DIR = path.join(__dirname, "..", ".embedded-pg");
const LOG_FILE = path.join(STATE_DIR, "db.log");

const PORT = Number(process.env.DB_PORT ?? "5442");
const USER = process.env.DB_USER ?? "parada";
const PASSWORD = process.env.DB_PASSWORD ?? "changeme";
const CONNECT = { port: PORT, user: USER, password: PASSWORD, database: "parada" };

/** How long to allow for initdb + first start + crash recovery. */
const READY_TIMEOUT_MS = Number(process.env.DB_READY_TIMEOUT_MS ?? "180000");

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (await portOpen(PORT)) {
    const alreadyReady = await waitForPostgres({ ...CONNECT, timeoutMs: 30_000 });
    if (alreadyReady) {
      console.log(`embedded postgres already ready on 127.0.0.1:${PORT}.`);
      return;
    }
  }

  const out = fs.openSync(LOG_FILE, "a");
  const err = fs.openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [path.join(__dirname, "start-dev-db.cjs")], {
    detached: true,
    stdio: ["ignore", out, err],
    env: { ...process.env, BACKGROUND: "1" },
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(out);
  fs.closeSync(err);

  console.log(
    `starting embedded postgres in background (pid ${child.pid}) — logs: ${path.relative(process.cwd(), LOG_FILE)}`
  );

  const ready = await waitForPostgres({ ...CONNECT, timeoutMs: READY_TIMEOUT_MS });
  if (!ready) {
    console.error(
      `embedded postgres did not become ready on 127.0.0.1:${PORT} within ${Math.round(
        READY_TIMEOUT_MS / 1000
      )}s. See ${path.relative(process.cwd(), LOG_FILE)}.`
    );
    process.exit(1);
  }
  console.log(`embedded postgres ready on 127.0.0.1:${PORT} — accepting queries.`);
}

main().catch((error) => {
  console.error("failed to start embedded postgres in background:", error.message ?? error);
  process.exit(1);
});
