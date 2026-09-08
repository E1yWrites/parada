"use strict";
/*
 * Create the dedicated test databases (`parada_test`, `parada_test_api`) on the
 * local Postgres instance so the jest suites can run. Idempotent — safe to run
 * repeatedly. Uses the same defaults as start-dev-db.cjs.
 *
 * Waits for real query-readiness first: `db:test:setup` is normally chained
 * straight after a start, and PostgreSQL accepts TCP connections while still in
 * startup/recovery (rejecting queries with 57P03).
 *
 * Usage:
 *   npm run db:test:setup -w @parada/database
 */
const { ensureDatabase, waitForPostgres } = require("./lib/pg-ready.cjs");

const HOST = process.env.DB_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DB_PORT ?? "5442");
const USER = process.env.DB_USER ?? "parada";
const PASSWORD = process.env.DB_PASSWORD ?? "changeme";
const SUPER_DB = "parada";

const CONNECT = { host: HOST, port: PORT, user: USER, password: PASSWORD, database: SUPER_DB };

async function main() {
  const ready = await waitForPostgres({ ...CONNECT, timeoutMs: 60_000 });
  if (!ready) {
    throw new Error(
      `Postgres at ${HOST}:${PORT} never became query-ready. Start it with: npm run db:start -w @parada/database`
    );
  }

  for (const db of ["parada_test", "parada_test_api"]) {
    const created = await ensureDatabase(CONNECT, db);
    console.log(created ? `created ${db}` : `${db} already exists — skipping.`);
  }
}

main().catch((err) => {
  console.error("failed to create test databases:", err.message);
  process.exit(1);
});
