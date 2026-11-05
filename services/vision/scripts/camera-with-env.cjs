#!/usr/bin/env node
"use strict";
/*
 * Start the camera runtime with one camera's settings loaded from an env file,
 * so each camera is a single command instead of a long list of $env: lines.
 *
 * Usage: node scripts/camera-with-env.cjs <env-file> [--debug|--no-debug] [run|test]
 *   npm run cam1            -> .env.cam-a01, run, saving what the camera sees to
 *                              <repo>/debug-crops/<camera id>/ (newest 200 frames)
 *   npm run cam2 -- test    -> .env.cam-a02, connection test
 *   npm run cam1:quiet      -> same as cam1 without saving debug files
 *
 * The env file's values override anything already set in the terminal, so a
 * tab that previously ran the other camera can't leak its settings in.
 * Env files hold camera passwords and are git-ignored (.env.*).
 */
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const argv = process.argv.slice(2);
const debug = argv.includes("--debug") && !argv.includes("--no-debug");
const [envFile, mode = "run", ...rest] = argv.filter((a) => a !== "--debug" && a !== "--no-debug");
if (!envFile) {
  console.error("usage: node scripts/camera-with-env.cjs <env-file> [run|test]");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const envPath = path.resolve(root, envFile);
if (!fs.existsSync(envPath)) {
  console.error(`${envPath} not found.`);
  process.exit(1);
}

const loaded = {};
for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) loaded[key] = value;
}

const env = { ...process.env, ...loaded };
// A file without CAMERA_EVENT_TYPE is an entry camera; don't inherit EXIT from
// a terminal tab that last ran the exit camera.
if (!("CAMERA_EVENT_TYPE" in loaded)) env.CAMERA_EVENT_TYPE = "ENTRY";
// RTSP over TCP: steadier than the UDP default on Wi-Fi cameras.
if (env.CAMERA_SOURCE === "rtsp" && !env.OPENCV_FFMPEG_CAPTURE_OPTIONS) {
  env.OPENCV_FFMPEG_CAPTURE_OPTIONS = "rtsp_transport;tcp";
}
// Speed for live cameras: full-frame OCR finds the plate, so skip OCR-ing the
// classical detector boxes one by one (~5 s -> ~3 s per frame). An env file can
// still set MAX_CANDIDATES_WITH_FULL_FRAME to bring them back.
if (!("MAX_CANDIDATES_WITH_FULL_FRAME" in loaded)) env.MAX_CANDIDATES_WITH_FULL_FRAME = "0";
// On Windows "localhost" tries IPv6 first and costs ~2 s per request.
if (env.PARADA_API_URL) {
  env.PARADA_API_URL = env.PARADA_API_URL.replace("://localhost", "://127.0.0.1");
}

if (!debug && !("VISION_DEBUG_DIR" in loaded)) {
  // A VISION_DEBUG_DIR left in the terminal from an earlier run would keep
  // writing debug files; only --debug (npm run cam1 / cam2) or the env file turn it on.
  delete env.VISION_DEBUG_DIR;
}
if (debug) {
  // One folder per camera so two debug runs never mix their frames.
  const repoRoot = path.join(root, "..", "..");
  env.VISION_DEBUG_DIR = path.join(repoRoot, "debug-crops", env.CAMERA_IDENTIFIER || "camera");
  console.log(`debug: saving the newest frames and OCR readings to ${env.VISION_DEBUG_DIR}`);
}

console.log(
  `camera ${env.CAMERA_IDENTIFIER || "?"} (${env.CAMERA_EVENT_TYPE || "ENTRY"}) from ${path.basename(envPath)} -> ${mode}`
);

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "venv-run.cjs"), "python", "-m", "app.camera.cli", mode, ...rest],
  { stdio: "inherit", env, cwd: root }
);
process.exit(result.status ?? 1);
