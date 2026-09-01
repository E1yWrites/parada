"use strict";
/*
 * Stop the PARADA development database started by start-dev-db.cjs in the
 * background. Reads the pid file written by the background instance.
 */
const fs = require("node:fs");
const path = require("node:path");

const PID_FILE = path.join(__dirname, "..", ".embedded-pg", "server.pid");

if (!fs.existsSync(PID_FILE)) {
  console.log("No embedded postgres pid file found — nothing to stop.");
  process.exit(0);
}

const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
if (!Number.isInteger(pid) || pid <= 0) {
  console.log("Invalid pid file — nothing to stop.");
  process.exit(0);
}

try {
  process.kill(pid, "SIGTERM");
  console.log(`Sent SIGTERM to embedded postgres (pid ${pid}).`);
} catch (err) {
  if (err.code === "ESRCH") {
    console.log("No such process — already stopped.");
  } else {
    throw err;
  }
}
fs.rmSync(PID_FILE, { force: true });