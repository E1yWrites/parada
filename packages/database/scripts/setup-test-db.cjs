"use strict";
/*
 * Create the dedicated test databases (`parada_test`, `parada_test_api`) on the
 * local Postgres instance so the jest suites can run. Idempotent — safe to run
 * repeatedly. Uses the same defaults as start-dev-db.cjs.
 *
 * Usage:
 *   npm run db:test:setup -w @parada/database
 */
const { Client } = require("pg");

const HOST = process.env.DB_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DB_PORT ?? "5432");
const USER = process.env.DB_USER ?? "parada";
const PASSWORD = process.env.DB_PASSWORD ?? "changeme";
const SUPER_DB = "parada";

async function main() {
  const client = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: SUPER_DB });
  await client.connect();
  const { rows } = await client.query("select datname from pg_database where datname like 'parada%'");
  const existing = rows.map((r) => r.datname);
  for (const db of ["parada_test", "parada_test_api"]) {
    if (existing.includes(db)) {
      console.log(`${db} already exists — skipping.`);
      continue;
    }
    await client.query('CREATE DATABASE "' + db + '"');
    console.log(`created ${db}`);
  }
  await client.end();
}

main().catch((err) => {
  console.error("failed to create test databases:", err.message);
  process.exit(1);
});