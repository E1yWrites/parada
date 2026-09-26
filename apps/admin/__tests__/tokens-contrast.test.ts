import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * WCAG 2.x contrast for the admin theme tokens, read straight from
 * app/globals.css so a palette edit that breaks a pair fails here.
 */
const ROOT = join(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

type RGB = [number, number, number];
type Vars = Record<string, RGB>;

function block(selectorPattern: RegExp): string {
  const match = css.match(selectorPattern);
  if (!match) throw new Error(`Block not found: ${selectorPattern}`);
  return match[1];
}

function vars(body: string): Vars {
  const out: Vars = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[m[1]] = [+m[2], +m[3], +m[4]];
  }
  return out;
}

const dark = vars(block(/:root\s*\{([^}]*)\}/));
const lightExplicit = vars(block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/));
const lightMedia = vars(block(/:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/));

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every declaration in a block, comments and indentation stripped. */
function declarations(body: string): string[] {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("admin light theme blocks", () => {
  it("the no-JS prefers-color-scheme block matches the [data-theme=light] block exactly", () => {
    expect(lightMedia).toEqual(lightExplicit);
    // Not just the colour channels: shadows, chevron, colour-scheme too.
    expect(declarations(block(/:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/))).toEqual(
      declarations(block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/))
    );
  });
});

describe("admin ambient decoration", () => {
  it("has no drifting background wash", () => {
    expect(css).not.toMatch(/parada-drift/);
    expect(css).not.toMatch(/radial-gradient/);
  });

  it("uses theme-aware card shadows, never black ones on the light theme", () => {
    const tailwind = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
    expect(tailwind).toMatch(/card: "var\(--shadow-card\)"/);
    expect(tailwind).not.toMatch(/rgb\(0 0 0/);
    const light = block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/);
    expect(light).toMatch(/--shadow-card:/);
    expect(light).not.toMatch(/rgb\(0 0 0/);
  });
});

const THEMES: [string, Vars][] = [
  ["dark", dark],
  ["light", lightExplicit],
];

// [foreground, background, minimum]
const PAIRS: [string, string, number][] = [
  ["charcoal", "card", 4.5],
  ["muted", "card", 4.5],
  ["muted", "raised", 4.5],
  ["muted", "paper", 4.5],
  ["brand-ink", "card", 4.5],
  ["brand-ink", "paper", 4.5],
  ["brand-ink", "brand-soft", 4.5],
  ["on-accent", "brand", 4.5],
  ["on-accent", "brand-hover", 4.5],
  ["paper", "success", 4.5],
  ["focus", "card", 3],
  ["focus", "paper", 3],
];

describe.each(THEMES)("admin %s theme contrast", (_name, t) => {
  it.each(PAIRS)("%s on %s", (fg, bg, min) => {
    expect(t[fg]).toBeDefined();
    expect(t[bg]).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe("admin token usage", () => {
  const files = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components"))];

  it("uses the type ramp, never arbitrary text-[Npx]/[Nrem] sizes", () => {
    const offenders = files.filter((f) => /text-\[\d[\d.]*(px|rem)\]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never uses brand-dark or faint as text (both fail 4.5:1 somewhere)", () => {
    const offenders = files.filter((f) => /\b(placeholder:)?text-(brand-dark|faint)\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("writes the cut corner with its token, not a literal", () => {
    const offenders = files.filter((f) => /rounded-tr-\[/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
