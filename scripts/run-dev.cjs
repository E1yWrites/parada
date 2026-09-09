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

/**
 * The API requires DATABASE_URL and JWT_SECRET and throws on either being
 * absent. Without this check that throw lands *after* the database has been
 * migrated, the workspaces have been built, and admin + Expo have already been
 * spawned — so the real error scrolls past behind Next.js and Metro output.
 * Fail here instead, before any of that work, with the fix spelled out.
 *
 * Values are never printed: only which key is wrong.
 */
function preflightApiEnv() {
  const envPath = path.join(root, "services", "api", ".env");
  const generate = 'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"';

  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    console.error(
      [
        "[run] services/api/.env is missing — the API cannot start without it.",
        "",
        "      .env is gitignored, so a fresh clone never has one. Create it:",
        "",
        "        cp services/api/.env.example services/api/.env",
        "",
        `      then set JWT_SECRET to a generated value:  ${generate}`,
        "",
        "      The example's DATABASE_URL already points at the embedded",
        "      development database on 127.0.0.1:5442.",
      ].join("\n")
    );
    process.exit(1);
  }

  const read = (key) => {
    const match = new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\r\\n]*)"?`, "m").exec(contents);
    return match ? match[1].trim() : "";
  };

  const problems = [];
  const databaseUrl = read("DATABASE_URL");
  const jwtSecret = read("JWT_SECRET");

  if (!databaseUrl) {
    problems.push("DATABASE_URL is missing or empty.");
  } else if (databaseUrl.includes("user:password@host:port")) {
    // The literal placeholder that shipped in .env.example before it was
    // corrected. It parses as a URL but can never connect.
    problems.push(
      "DATABASE_URL is still the placeholder. For the embedded development database use:\n" +
        '        DATABASE_URL="postgresql://parada:changeme@127.0.0.1:5442/parada?schema=public"'
    );
  }

  if (!jwtSecret) {
    problems.push("JWT_SECRET is missing or empty.");
  } else if (jwtSecret === "replace-with-a-long-random-secret") {
    problems.push(`JWT_SECRET is still the placeholder. Generate one:\n        ${generate}`);
  }

  if (problems.length > 0) {
    console.error(`[run] services/api/.env is not usable yet:\n\n      - ${problems.join("\n      - ")}`);
    process.exit(1);
  }
}

preflightApiEnv();

console.log("[run] Building API...");
run(npm, ["run", "db:prepare"]);
// Build through turbo, not `npm run build -w @parada/api`. The API imports
// @parada/database, @parada/types and @parada/config, which all resolve through
// their built dist/ — and dist/ is gitignored, so on a fresh clone none of it
// exists. Building the API workspace alone skipped those dependencies and failed
// with ~150 "Cannot find module '@parada/...'" errors plus their knock-on
// implicit-any noise. turbo.json already declares build.dependsOn ["^build"];
// this just lets turbo honour it.
run("npx", ["turbo", "run", "build", "--filter=@parada/api"]);

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
