#!/usr/bin/env node
/* eslint-env node */
// Detects this machine's LAN IPv4 address and writes it into
// EXPO_PUBLIC_API_URL (.env) and REACT_NATIVE_PACKAGER_HOSTNAME (.env.local)
// so the mobile app and Metro bundler stay reachable when the dev machine
// switches networks (home Wi-Fi, hotspot, another office, etc).
//
// EXPO_PUBLIC_API_URL is only rewritten while it is missing or a plain-http
// loopback/private-LAN address (a value this script could have written). An
// https:// URL or a public host was set on purpose (ONLINE / HYBRID / tunnel)
// and is kept.
//
// Usage: node scripts/set-lan-ip.js [ip-override]
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// localhost, 127/8, [::1], and the RFC 1918 + link-local IPv4 ranges
// (10.0.2.2, the Android emulator alias, is inside 10/8).
const LOCAL_HOST_RE =
  /^(localhost|\[::1\]|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2})$/i;

/** True for a plain-http loopback/LAN API base URL, e.g. http://192.168.1.5:4100 */
function isLocalDevApiUrl(value) {
  const match = /^http:\/\/(\[[^\]]+\]|[^/:]+)(:\d+)?\/?$/i.exec(value.trim());
  return match !== null && LOCAL_HOST_RE.test(match[1]);
}

/** Value of `KEY=value` in dotenv text (quotes stripped), or null. Comment lines never match. */
function readEnvValue(content, key) {
  const match = new RegExp(`^\\s*${key}\\s*=(.*)$`, "m").exec(content);
  if (!match) return null;
  return match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
}

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

function main({ dir = path.join(__dirname, ".."), override = process.argv[2] } = {}) {
  const envPath = path.join(dir, ".env");
  const envLocalPath = path.join(dir, ".env.local");
  const { name, address } = pickAddress(override);
  console.log(`[set-lan-ip] using ${address} (${name})`);

  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const current = readEnvValue(envContent, "EXPO_PUBLIC_API_URL");
  if (current && !isLocalDevApiUrl(current)) {
    console.log(`[set-lan-ip] keeping EXPO_PUBLIC_API_URL=${current} (not a plain-http loopback/LAN address)`);
  } else {
    const portMatch = current ? /:(\d+)\/?$/.exec(current) : null;
    const port = portMatch ? `:${portMatch[1]}` : ":4100";
    updateEnvFile(envPath, "EXPO_PUBLIC_API_URL", `http://${address}${port}`);
  }
  updateEnvFile(envLocalPath, "REACT_NATIVE_PACKAGER_HOSTNAME", address, { createIfMissing: true });
}

if (require.main === module) {
  main();
}

module.exports = { isLocalDevApiUrl, readEnvValue, main };
