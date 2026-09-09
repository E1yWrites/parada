"use strict";
/*
 * "Background start" entry point for the PARADA development database.
 *
 * The cluster is started through `pg_ctl` (see scripts/lib/cluster.cjs), which
 * leaves behind a postmaster that is independent of whatever process started
 * it. There is therefore NO launcher process to detach or supervise: this
 * script starts the server, waits until it answers a real query, and exits.
 *
 * That matters for correctness, not just tidiness. The previous implementation
 * spawned a long-lived Node "launcher" that owned the postmaster as a child.
 * When the cluster died, the launcher stayed alive holding a stale handle, and
 * those orphans accumulated across runs — a `db:stop` could then force-kill a
 * recycled PID belonging to an unrelated process.
 *
 * IMPORTANT: this command does not return until the cluster actually answers a
 * query. `npm run db:prepare` runs `prisma migrate deploy` on the very next
 * line, and PostgreSQL accepts TCP connections while it is still starting up —
 * so returning early made the first migration fail with
 * `FATAL: the database system is starting up`.
 *
 * Usage:
 *   npm run db:start -w @parada/database
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.DB_PORT ?? "5442");

const child = spawn(process.execPath, [path.join(__dirname, "start-dev-db.cjs")], {
  stdio: "inherit",
  env: { ...process.env, BACKGROUND: "1" },
  windowsHide: true,
});

child.on("error", (error) => {
  console.error("failed to start embedded postgres:", error.message ?? error);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`embedded postgres ready on 127.0.0.1:${PORT} — accepting queries.`);
  }
  process.exit(code ?? 1);
});
