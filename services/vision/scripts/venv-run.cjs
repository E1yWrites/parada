#!/usr/bin/env node
"use strict";
/*
 * Run an executable from the local .venv, resolving the correct bin
 * directory for the current OS (.venv/bin on macOS/Linux, .venv\Scripts on
 * Windows) instead of hardcoding a POSIX path.
 *
 * Usage: node scripts/venv-run.cjs <exe> [...args]
 */
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const [exe, ...args] = process.argv.slice(2);
if (!exe) {
  console.error("usage: node scripts/venv-run.cjs <exe> [...args]");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const binDir = path.join(root, ".venv", process.platform === "win32" ? "Scripts" : "bin");
const exePath = path.join(binDir, process.platform === "win32" ? `${exe}.exe` : exe);

if (!fs.existsSync(exePath)) {
  console.error(`${exePath} not found — run "npm run setup -w @parada/vision" first.`);
  process.exit(1);
}

const result = spawnSync(exePath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
