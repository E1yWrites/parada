"use strict";
/*
 * PARADA local development database (embedded Postgres, no root/Docker).
 *
 * Starts an embedded PostgreSQL 18 cluster on the configured port and keeps it
 * alive for the lifetime of this process. Data persists in `.embedded-pg/`.
 *
 * Usage:
 *   npm run db:dev -w @parada/database   (start, foreground)
 *   npm run db:start -w @parada/database (start, background, writes pid file)
 *   npm run db:stop -w @parada/database  (stop a background instance)
 */
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const EmbeddedPostgres = require("embedded-postgres").default;

const DATA_DIR = path.join(__dirname, "..", ".embedded-pg", "data");
const STATE_DIR = path.join(__dirname, "..", ".embedded-pg");
const PID_FILE = path.join(STATE_DIR, "server.pid");

const PORT = Number(process.env.DB_PORT ?? "5432");
const USER = process.env.DB_USER ?? "parada";
const PASSWORD = process.env.DB_PASSWORD ?? "changeme";

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function writePid() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
}

async function main() {
  if (await portOpen(PORT)) {
    console.log(`embedded postgres already running on 127.0.0.1:${PORT} — nothing to do.`);
    process.exit(0);
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  // Only initialise (initdb) on the first run. Once the cluster is on disk this
  // must be skipped, otherwise initdb fails with "directory exists but is not
  // empty" on every subsequent restart.
  const dataReady = fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (!dataReady) {
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase("parada").catch((err) => {
    if (!String(err).includes("already exists")) throw err;
  });

  console.log(`embedded postgres ready on 127.0.0.1:${PORT} (user=${USER}, db=parada)`);
  console.log(`data dir: ${DATA_DIR}`);
  writePid();
  console.log(`pid: ${process.pid}`);

  if (process.env.BACKGROUND === "1") {
    process.on("SIGTERM", () => process.exit(0));
    process.on("SIGINT", () => process.exit(0));
  }

  setInterval(() => undefined, 1 << 30);
}

main().catch((err) => {
  console.error("failed to start embedded postgres:", err);
  process.exit(1);
});