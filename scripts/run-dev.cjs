"use strict";

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
let shuttingDown = false;

const isWindows = process.platform === "win32";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function start(name, args, cwd) {
  const child = spawn(npm, args, {
    cwd: path.resolve(root, cwd),
    stdio: "inherit",
    shell: isWindows,
    env: { ...process.env },
  });
  child.on("error", (error) => {
    console.error(`[run] ${name} failed to start:`, error.message);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown && (code ?? 1) !== 0) {
      console.error(`[run] ${name} exited with ${signal ?? `code ${code}`}.`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));


/** Read PORT from services/api/.env so the printed URL matches reality. */
function readApiPort() {
  try {
    const envFile = fs.readFileSync(path.join(root, "services", "api", ".env"), "utf8");
    const match = /^\s*PORT\s*=\s*"?(\d+)"?/m.exec(envFile);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Non-loopback IPv4 addresses this machine serves the LAN on. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

/**
 * Expo's LAN mode serves the bundle to a physical device, and on that device
 * `localhost` is the PHONE, not this machine — so a localhost API URL silently
 * fails every request from a real handset. Warn (never rewrite the developer's
 * .env) with the concrete value to use.
 */
function warnAboutMobileLanUrl(apiPort) {
  let configured = process.env.EXPO_PUBLIC_API_URL ?? null;
  if (!configured) {
    try {
      const envFile = fs.readFileSync(path.join(root, "apps", "mobile", ".env"), "utf8");
      const match = /^\s*EXPO_PUBLIC_API_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(envFile);
      configured = match ? match[1].trim() : null;
    } catch {
      configured = null;
    }
  }

  const addresses = lanAddresses();
  const suggestion = addresses.length > 0 ? `http://${addresses[0]}:${apiPort}` : `http://<your-LAN-IP>:${apiPort}`;

  if (!configured) {
    console.warn(
      `[run] WARNING: apps/mobile/.env has no EXPO_PUBLIC_API_URL. A physical device cannot reach the API. Set EXPO_PUBLIC_API_URL=${suggestion}`
    );
    return;
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(configured)) {
    console.warn(
      `[run] WARNING: EXPO_PUBLIC_API_URL is ${configured}. On a physical device "localhost" is the phone itself, so API calls will fail. Use ${suggestion} (detected LAN address${
        addresses.length > 1 ? `es: ${addresses.join(", ")}` : ""
      }). Android emulator: http://10.0.2.2:${apiPort}`
    );
  }
}

console.log("[run] Building API...");
run(npm, ["run", "db:prepare"]);
run(npm, ["run", "build", "-w", "@parada/api"]);

start("API", ["run", "start"], "services/api");
start("admin", ["run", "dev"], "apps/admin");
start("mobile", ["run", "dev:lan"], "apps/mobile");

const apiPort = process.env.PORT ?? readApiPort() ?? "4100";

console.log(`[run] API: http://localhost:${apiPort} (binds to 0.0.0.0)`);
console.log("[run] Admin: http://localhost:3000");
console.log("[run] Mobile: Expo LAN development server (Metro on port 8082 — 8081 is taken by the Windows Host Network Service)");
console.log("[run] Database: embedded development database started; data is preserved between runs");
warnAboutMobileLanUrl(apiPort);
console.log("[run] Press Ctrl+C to stop.");
