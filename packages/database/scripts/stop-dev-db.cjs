"use strict";
/*
 * Stop the PARADA development database started by start-dev-db.cjs in the
 * background.
 *
 * The stop is requested via a file rather than only a signal because Windows
 * has no real SIGTERM: `process.kill(pid, "SIGTERM")` maps to TerminateProcess,
 * so the launcher's handler never runs, the postmaster is orphaned or killed
 * abruptly, and the NEXT start pays for it with crash recovery (which is what
 * surfaced as `FATAL: the database system is starting up`). The launcher polls
 * for this file and shuts the cluster down cleanly. A signal is still used as a
 * fallback if the file channel is not honoured in time.
 */
const fs = require("node:fs");
const path = require("node:path");
const { portOpen, sleep } = require("./lib/pg-ready.cjs");

const STATE_DIR = path.join(__dirname, "..", ".embedded-pg");
const PID_FILE = path.join(STATE_DIR, "server.pid");
const STOP_FILE = path.join(STATE_DIR, "stop.request");

const PORT = Number(process.env.DB_PORT ?? "5442");

function readPid() {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }
  const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

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

async function main() {
  const pid = readPid();

  if (!(await portOpen(PORT))) {
    // Nothing listening — clean up any stale bookkeeping and stop.
    fs.rmSync(PID_FILE, { force: true });
    fs.rmSync(STOP_FILE, { force: true });
    console.log("No embedded postgres listening — nothing to stop.");
    return;
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STOP_FILE, String(Date.now()));
  console.log("Requested a clean shutdown of the embedded postgres cluster...");

  if (await waitForPortClosed(30_000)) {
    fs.rmSync(PID_FILE, { force: true });
    fs.rmSync(STOP_FILE, { force: true });
    console.log("Embedded postgres stopped cleanly.");
    return;
  }

  if (pid && processAlive(pid)) {
    console.warn("Clean shutdown timed out — sending SIGTERM to the launcher.");
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") {
        throw error;
      }
    }
    await waitForPortClosed(15_000);
  }

  fs.rmSync(PID_FILE, { force: true });
  fs.rmSync(STOP_FILE, { force: true });

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
