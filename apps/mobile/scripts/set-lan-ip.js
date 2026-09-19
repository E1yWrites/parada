#!/usr/bin/env node
/* eslint-env node */
// Detects this machine's LAN IPv4 address and writes it into
// EXPO_PUBLIC_API_URL (.env) and REACT_NATIVE_PACKAGER_HOSTNAME (.env.local)
// so the mobile app and Metro bundler stay reachable when the dev machine
// switches networks (home Wi-Fi, hotspot, another office, etc).
//
// Usage: node scripts/set-lan-ip.js [ip-override]
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");
const ENV_LOCAL_PATH = path.join(__dirname, "..", ".env.local");

const VIRTUAL_NAME_RE = /virtualbox|vethernet|hyper-v|loopback|wsl|tailscale|zerotier|docker|vmware/i;
const LINK_LOCAL_RE = /^169\.254\./;

function candidateInterfaces() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (VIRTUAL_NAME_RE.test(name)) continue;
    for (const addr of addrs || []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (LINK_LOCAL_RE.test(addr.address)) continue;
      candidates.push({ name, address: addr.address });
    }
  }
  return candidates;
}

function pickAddress(override) {
  if (override) return { name: "override", address: override };

  const candidates = candidateInterfaces();
  if (candidates.length === 0) {
    throw new Error("No non-virtual LAN IPv4 address found. Pass one explicitly: node scripts/set-lan-ip.js <ip>");
  }

  const wifi = candidates.find((c) => /wi-?fi|wlan/i.test(c.name));
  const chosen = wifi || candidates[0];

  if (candidates.length > 1) {
    console.log("[set-lan-ip] multiple LAN addresses found:");
    for (const c of candidates) {
      const marker = c === chosen ? "->" : "  ";
      console.log(`  ${marker} ${c.name}: ${c.address}`);
    }
    console.log("[set-lan-ip] pass an explicit IP as an argument to override.");
  }

  return chosen;
}

function updateEnvFile(filePath, key, newValue, { createIfMissing = false } = {}) {
  const lineRe = new RegExp(`^${key}=.*$`, "m");

  if (!fs.existsSync(filePath)) {
    if (!createIfMissing) return false;
    fs.writeFileSync(filePath, `${key}=${newValue}\n`);
    console.log(`[set-lan-ip] created ${path.basename(filePath)} with ${key}=${newValue}`);
    return true;
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (!lineRe.test(content)) {
    const appended = content.endsWith("\n") ? content : `${content}\n`;
    fs.writeFileSync(filePath, `${appended}${key}=${newValue}\n`);
    console.log(`[set-lan-ip] appended ${key}=${newValue} to ${path.basename(filePath)}`);
    return true;
  }

  const updated = content.replace(lineRe, `${key}=${newValue}`);
  if (updated === content) {
    console.log(`[set-lan-ip] ${path.basename(filePath)}: ${key} already ${newValue}`);
    return false;
  }
  fs.writeFileSync(filePath, updated);
  console.log(`[set-lan-ip] ${path.basename(filePath)}: ${key} -> ${newValue}`);
  return true;
}

function main() {
  const override = process.argv[2];
  const { name, address } = pickAddress(override);
  console.log(`[set-lan-ip] using ${address} (${name})`);

  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const portMatch = envContent.match(/EXPO_PUBLIC_API_URL=https?:\/\/[^:/\s]+(:\d+)?/);
  const port = portMatch && portMatch[1] ? portMatch[1] : ":4100";

  updateEnvFile(ENV_PATH, "EXPO_PUBLIC_API_URL", `http://${address}${port}`);
  updateEnvFile(ENV_LOCAL_PATH, "REACT_NATIVE_PACKAGER_HOSTNAME", address, { createIfMissing: true });
}

main();
