#!/usr/bin/env node
// Mechanical subset of design-taste-frontend Section 14 pre-flight checks.
// Usage: node design-preflight.mjs <file-or-glob...>
// Exits 1 if any file fails a check.

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const BANNED_HEX = [
  "#f5f1ea", "#f7f5f1", "#fbf8f1", "#efeae0", "#ece6db", "#faf7f1", "#e8dfcb",
  "#b08947", "#b6553a", "#9a2436", "#9c6e2a", "#bc7c3a", "#7d5621",
  "#1a1714", "#1a1814", "#1b1814",
];

// intent -> phrases that all mean the same CTA
const CTA_INTENT_GROUPS = [
  ["get in touch", "contact us", "let's talk", "start a project", "start something", "reach out"],
  ["try free", "get started", "sign up free", "sign up", "start free trial"],
  ["view work", "see selected work", "browse projects", "view portfolio", "see our work"],
];

function findFiles(patterns) {
  const files = new Set();
  for (const p of patterns) {
    for (const f of globSync(p)) files.add(f);
  }
  return [...files];
}

function checkFile(path) {
  const src = readFileSync(path, "utf8");
  const failures = [];

  // 1. Em-dash ban
  const dashMatches = [...src.matchAll(/[—–]/g)];
  if (dashMatches.length) {
    failures.push(`em-dash/en-dash found (${dashMatches.length}x) — replace with "-"`);
  }

  // 2. Banned premium-consumer palette hex codes
  const lower = src.toLowerCase();
  for (const hex of BANNED_HEX) {
    if (lower.includes(hex)) {
      failures.push(`banned beige/brass palette hex: ${hex}`);
    }
  }

  // 3. Marquee max-one-per-page
  const marqueeCount = (src.match(/marquee/gi) || []).length;
  if (marqueeCount > 1) {
    failures.push(`marquee referenced ${marqueeCount}x (max 1 usage per page, some hits may be duplicate refs — verify manually)`);
  }

  // 4. Eyebrow count vs section count
  const eyebrowCount = (src.match(/uppercase\s+tracking/gi) || []).length;
  const sectionCount = Math.max((src.match(/<section\b/gi) || []).length, 1);
  const eyebrowCap = Math.ceil(sectionCount / 3);
  if (eyebrowCount > eyebrowCap) {
    failures.push(`eyebrow count ${eyebrowCount} exceeds cap ${eyebrowCap} (ceil(${sectionCount} sections / 3))`);
  }

  // 5. Duplicate CTA intent (heuristic: extract visible text in button/a/Link tags)
  const ctaTexts = [...src.matchAll(/<(?:button|a|Link)[^>]*>\s*([^<{}\n]{2,40})\s*</gi)]
    .map((m) => m[1].trim().toLowerCase())
    .filter(Boolean);
  for (const group of CTA_INTENT_GROUPS) {
    const hits = [...new Set(ctaTexts.filter((t) => group.some((phrase) => t.includes(phrase))))];
    if (hits.length > 1) {
      failures.push(`duplicate CTA intent: ${JSON.stringify(hits)} all mean the same thing — pick one label`);
    }
  }

  return failures;
}

const patterns = process.argv.slice(2);
if (!patterns.length) {
  console.error("Usage: node design-preflight.mjs <file-or-glob...>");
  process.exit(2);
}

const files = findFiles(patterns);
if (!files.length) {
  console.error("No files matched.");
  process.exit(2);
}

let anyFail = false;
for (const file of files) {
  const failures = checkFile(file);
  if (failures.length) {
    anyFail = true;
    console.log(`\nFAIL ${file}`);
    for (const f of failures) console.log(`  - ${f}`);
  } else {
    console.log(`ok   ${file}`);
  }
}

console.log(
  "\nNote: this covers only the mechanically-checkable subset of Section 14 " +
  "(em-dash, banned palette hex, marquee count, eyebrow count, duplicate CTA intent).\n" +
  "Contrast, nav height, Core Web Vitals, and layout-repetition checks still need " +
  "axe-core/Playwright/Lighthouse or manual review — see SKILL.md Section 14."
);

process.exit(anyFail ? 1 : 0);
