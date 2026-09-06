"use strict";

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
let shuttingDown = false;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function start(name, args, cwd) {
  const child = spawn(npm, args, {
    cwd: path.resolve(root, cwd),
    stdio: "inherit",
    shell: false,
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

console.log("[run] Building API...");
run(npm, ["run", "db:prepare"]);
run(npm, ["run", "build", "-w", "@parada/api"]);

start("API", ["run", "start"], "services/api");
start("admin", ["run", "dev"], "apps/admin");
start("mobile", ["run", "dev:lan"], "apps/mobile");

console.log("[run] API: http://localhost:4000 (binds to 0.0.0.0)");
console.log("[run] Admin: http://localhost:3000");
console.log("[run] Mobile: Expo LAN development server");
console.log("[run] Database: embedded development database started; data is preserved between runs");
console.log("[run] Press Ctrl+C to stop.");
