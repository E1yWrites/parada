"use strict";
/*
 * Shared readiness/ownership helpers for the PARADA embedded development
 * database.
 *
 * WHY THIS EXISTS
 * ---------------
 * A plain TCP connect to 127.0.0.1:5442 is NOT a readiness signal for
 * PostgreSQL: the postmaster binds and accepts sockets while it is still
 * performing startup/crash recovery, and every query in that window is
 * rejected with `FATAL: the database system is starting up` (SQLSTATE 57P03).
 * `prisma migrate deploy` running immediately after `db:start` therefore hit a
 * race it could not win. `waitForPostgres` closes that race by probing with a
 * real `select 1` and retrying on the transient startup states only.
 */

const net = require("node:net");
const { Client } = require("pg");

/** Postgres error codes that mean "not ready yet", not "broken". */
const TRANSIENT_SQLSTATES = new Set([
  "57P03", // cannot_connect_now — the database system is starting up
  "53300", // too_many_connections
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
]);

const TRANSIENT_SYSCALL_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
]);

function isTransient(error) {
  if (!error) {
    return false;
  }
  if (error.code && TRANSIENT_SQLSTATES.has(error.code)) {
    return true;
  }
  if (error.code && TRANSIENT_SYSCALL_CODES.has(error.code)) {
    return true;
  }
  // node-postgres surfaces an abrupt close during recovery as a plain Error.
  return /terminated unexpectedly|starting up|shutting down|Connection terminated/i.test(
    String(error.message ?? error)
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when a TCP listener answers on the port (liveness, NOT readiness). */
function portOpen(port, host = "127.0.0.1", timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/**
 * Open a client, run `fn`, and ALWAYS close it.
 *
 * The leaked-connection bug this guards against is the reason the cluster kept
 * dying: `EmbeddedPostgres.createDatabase()` calls `client.end()` only on the
 * success path, so a `CREATE DATABASE` that fails with "already exists" (every
 * run after the first) left a live server backend attached to the launcher's
 * console. When that console was closed or Ctrl+C'd, the backend died
 * abnormally (STATUS_CONTROL_C_EXIT / 0xC000013A), and the postmaster reacted
 * the only way it can to an abnormal backend exit: "terminating any other
 * active server processes" — a full crash shutdown. That is what produced both
 * `Can't reach database server at 127.0.0.1:5442` and the crash recovery that
 * made the next start report `the database system is starting up`.
 */
async function withClient(options, fn) {
  const client = new Client({
    host: options.host ?? "127.0.0.1",
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database ?? "postgres",
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
  });
  // Never let a background socket error become an unhandled 'error' event.
  client.on("error", () => undefined);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Block until the cluster answers a real query, or the deadline passes.
 * Returns true when ready; false on timeout.
 */
async function waitForPostgres(options) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 300;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  for (;;) {
    try {
      await withClient({ ...options, connectionTimeoutMillis: 3000 }, (client) =>
        client.query("select 1")
      );
      return true;
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) {
        // A non-transient failure before the deadline is still worth retrying
        // briefly (the cluster may not have created the role/db yet), but it is
        // reported if it persists.
        if (Date.now() >= deadline) {
          throw error;
        }
      }
      if (Date.now() >= deadline) {
        if (options.throwOnTimeout) {
          throw lastError;
        }
        return false;
      }
      await sleep(intervalMs);
    }
  }
}

/** Idempotently create `name` if absent. Always closes its connection. */
async function ensureDatabase(options, name) {
  return withClient(options, async (client) => {
    const { rows } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (rows.length > 0) {
      return false;
    }
    // Identifier is a fixed internal constant, never user input; quoted anyway.
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    return true;
  });
}

module.exports = { ensureDatabase, isTransient, portOpen, sleep, waitForPostgres, withClient };
