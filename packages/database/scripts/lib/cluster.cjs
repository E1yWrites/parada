"use strict";
/*
 * Lifecycle of the PARADA embedded development PostgreSQL cluster.
 *
 * WHY pg_ctl RATHER THAN embedded-postgres's OWN start()/stop()
 * ------------------------------------------------------------
 * `EmbeddedPostgres.start()` spawns `postgres.exe` as an ordinary child of the
 * Node script that called it, and its own documentation says the cluster "is
 * automatically shut down when the script exits". That binds the postmaster's
 * lifetime to a transient developer-tool process, which produced two failures
 * that were observed in this repository:
 *
 *   1. The postmaster shares the launcher's console/process group, so a console
 *      control event aimed at the tooling reached PostgreSQL's own background
 *      workers. The server log recorded:
 *
 *        background worker "logical replication launcher" ...
 *          was terminated by exception 0xC000013A      (STATUS_CONTROL_C_EXIT)
 *        terminating any other active server processes
 *
 *      A worker dying abnormally forces the postmaster into a crash shutdown,
 *      taking the whole cluster with it. Every consumer afterwards failed with
 *      `Can't reach database server at 127.0.0.1:5442`.
 *
 *   2. `EmbeddedPostgres.stop()` on Windows is `taskkill /pid <pid> /f /t` — a
 *      forced termination, never a clean shutdown. So the NEXT start always had
 *      to run crash recovery, and every query issued during recovery is
 *      rejected with `FATAL: the database system is starting up` (SQLSTATE
 *      57P03). That is the window `prisma migrate deploy` kept losing.
 *
 * `pg_ctl` is PostgreSQL's own supported way to run a background server. It
 * starts a postmaster that is independent of the caller (pg_ctl itself exits),
 * and `stop -m fast` performs a real shutdown checkpoint, so the next start
 * logs "database system was shut down" instead of entering recovery. It ships
 * inside every @embedded-postgres platform package, so this stays dependency-
 * free and works unchanged on Windows, macOS, and Linux/WSL.
 *
 * initdb is still delegated to embedded-postgres so first-run provisioning
 * (superuser, password file, locale) keeps working exactly as before.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Resolve the PostgreSQL binaries for this platform.
 *
 * Uses dynamic `import()` rather than `require()`: @embedded-postgres/* and
 * embedded-postgres are ESM-only ("type": "module"), and `require()` of an ESM
 * package throws ERR_REQUIRE_ESM on Node 18 and 20. Dynamic import works on
 * every supported Node version.
 */
async function resolveBinaries() {
  const platform = process.platform;
  const arch = process.arch;
  const key = `${platform}-${arch}`;
  const packages = {
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "linux-arm64": "@embedded-postgres/linux-arm64",
    "linux-arm": "@embedded-postgres/linux-arm",
    "linux-ia32": "@embedded-postgres/linux-ia32",
    "linux-ppc64": "@embedded-postgres/linux-ppc64",
    "linux-x64": "@embedded-postgres/linux-x64",
    "win32-x64": "@embedded-postgres/windows-x64",
  };
  const packageName = packages[key];
  if (!packageName) {
    throw new Error(`Unsupported platform/arch for the embedded database: ${key}`);
  }
  const binaries = await import(packageName);
  return { pgCtl: binaries.pg_ctl, postgres: binaries.postgres, initdb: binaries.initdb };
}

/**
 * Run a binary to completion, capturing its output. Never uses a shell.
 *
 * Resolves on "exit", NOT "close". `pg_ctl start` leaves behind a postmaster
 * that inherits pg_ctl's stdout/stderr handles, so those pipes stay open for
 * the entire life of the database server. "close" waits for every stdio stream
 * to end and therefore never fires — the caller would hang forever even though
 * pg_ctl itself exited successfully seconds earlier. The pipes are destroyed
 * once the exit code is known so the surviving server cannot keep this process
 * alive either.
 */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    const finish = (code, error) => {
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ code, stdout, stderr: error ?? stderr });
    };
    child.on("error", (error) => finish(-1, String(error.message ?? error)));
    child.on("exit", (code) => {
      // Give any already-buffered output a turn to be delivered before the
      // pipes are torn down.
      setImmediate(() => finish(code ?? -1));
    });
  });
}

/**
 * `pg_ctl status` exit codes (documented): 0 = running, 3 = not running,
 * 4 = the data directory is absent or unreadable.
 */
async function clusterStatus(dataDir) {
  const { pgCtl } = await resolveBinaries();
  const { code, stdout } = await run(pgCtl, ["-D", dataDir, "status"]);
  if (code === 0) {
    const match = /PID:\s*(\d+)/.exec(stdout);
    return { running: true, pid: match ? Number(match[1]) : null };
  }
  return { running: false, pid: null, initialised: code !== 4 };
}

/** True once the cluster has been initialised on disk (initdb has run). */
function isInitialised(dataDir) {
  return fs.existsSync(path.join(dataDir, "PG_VERSION"));
}

/**
 * Run initdb for a first-time cluster. Delegated to embedded-postgres so the
 * superuser/password/locale provisioning stays identical to what produced the
 * existing development data directory.
 */
async function initialiseCluster({ dataDir, user, password, port }) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
    onError: () => undefined,
  });
  await pg.initialise();
}

/**
 * Start the cluster and wait for it to accept connections.
 *
 * `-w` makes pg_ctl block until the server is ready rather than returning as
 * soon as it has forked, so a caller that immediately runs migrations is not
 * racing startup. Readiness is still verified with a real query by the caller
 * (see lib/pg-ready.cjs) — `-w` alone is a liveness signal, not proof that the
 * application database answers.
 */
async function startCluster({ dataDir, port, logFile, user, password }) {
  if (!isInitialised(dataDir)) {
    await initialiseCluster({ dataDir, user, password, port });
  }

  const { pgCtl } = await resolveBinaries();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const result = await run(pgCtl, [
    "-D",
    dataDir,
    "-l",
    logFile,
    "-o",
    `-p ${port}`,
    "-w",
    "start",
  ]);

  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`pg_ctl could not start the cluster (exit ${result.code}). ${detail}`);
  }
}

/**
 * Shut the cluster down cleanly. `-m fast` disconnects clients and writes a
 * shutdown checkpoint, which is what keeps the next start out of crash
 * recovery — and therefore out of the 57P03 window.
 */
async function stopCluster({ dataDir }) {
  const { pgCtl } = await resolveBinaries();
  const result = await run(pgCtl, ["-D", dataDir, "-m", "fast", "-w", "stop"]);
  if (result.code === 0) {
    return { stopped: true };
  }
  const detail = (result.stderr || result.stdout || "").trim();
  // pg_ctl reports "not running" (exit 3) as a failure; for a stop request that
  // is the desired end state, not an error.
  if (/not running/i.test(detail)) {
    return { stopped: true, alreadyStopped: true };
  }
  return { stopped: false, detail };
}

module.exports = {
  clusterStatus,
  isInitialised,
  resolveBinaries,
  startCluster,
  stopCluster,
};
