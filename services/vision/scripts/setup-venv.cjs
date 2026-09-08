#!/usr/bin/env node
"use strict";
/*
 * Cross-platform virtualenv bootstrap for the vision service.
 *
 * Replaces the old POSIX-only instructions (python3 -m venv --without-pip,
 * curl | .venv/bin/python3 get-pip.py) with a single portable step: create
 * the venv with its bundled pip (available on both Windows and POSIX
 * Python 3 installs), then install requirements.txt into it.
 *
 * Usage: node scripts/setup-venv.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const venvDir = path.join(root, ".venv");

function findPython() {
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const cmd of candidates) {
    const check = spawnSync(cmd, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
    if (check.status === 0) return cmd;
  }
  throw new Error(`No Python 3 interpreter found on PATH (tried: ${candidates.join(", ")}).`);
}

if (!fs.existsSync(venvDir)) {
  const python = findPython();
  console.log(`creating virtualenv at .venv with "${python}"...`);
  const create = spawnSync(python, ["-m", "venv", venvDir], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (create.status !== 0) process.exit(create.status ?? 1);
} else {
  console.log(".venv already exists — skipping creation.");
}

const binDir = path.join(venvDir, process.platform === "win32" ? "Scripts" : "bin");
const pipExe = path.join(binDir, process.platform === "win32" ? "pip.exe" : "pip");

const install = spawnSync(pipExe, ["install", "-r", path.join(root, "requirements.txt")], {
  stdio: "inherit",
});
process.exit(install.status ?? 1);
