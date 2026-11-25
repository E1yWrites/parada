import { render, screen } from "@/src/test/utils";
import { Button, Input, PlateChip, StatusBadge } from "@/src/components";
import { useColors } from "@/src/providers/ThemeProvider";
import { inkColor, palettes, softColor, type ColorScheme, type ColorTokens } from "@/src/theme";

/**
 * WCAG 2.x contrast, computed from the token values themselves so a palette
 * edit that breaks a text pair fails here instead of shipping. Translucent
 * fills (`rgba(...)` / `#RRGGBBAA`) are composited over the ground they sit on.
 */
type RGB = [number, number, number];
type RGBA = { rgb: RGB; alpha: number };

function parse(color: string): RGBA {
  const rgba = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) return { rgb: [+rgba[1], +rgba[2], +rgba[3]], alpha: +rgba[4] };
  const hex = color.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!hex) throw new Error(`Unparseable color: ${color}`);
  const n = hex[1];
  return {
    rgb: [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)],
    alpha: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
  };
}

function over(fill: string, ground: string): RGB {
  const f = parse(fill);
  const g = parse(ground).rgb;
  return f.rgb.map((v, i) => Math.round(v * f.alpha + g[i] * (1 - f.alpha))) as RGB;
}

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

const SCHEMES: ColorScheme[] = ["dark", "light"];
const GROUNDS: (keyof ColorTokens)[] = ["background", "surface", "surfaceElevated"];
const TEXT_TOKENS: (keyof ColorTokens)[] = ["foreground", "muted", "primaryDeep"];
const STATUS_TOKENS: (keyof ColorTokens)[] = ["primary", "danger", "success", "warning", "info", "highlight"];

describe("theme contrast: text tokens on every ground", () => {
  for (const scheme of SCHEMES) {
    const t = palettes[scheme];
    for (const token of TEXT_TOKENS) {
      for (const ground of GROUNDS) {
        it(`${scheme} ${token} on ${ground} is >= 4.5:1`, () => {
          const ratio = contrast(parse(t[token] as string).rgb, parse(t[ground] as string).rgb);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe("theme contrast: solid-fill and non-text pairs", () => {
  for (const scheme of SCHEMES) {
    const t = palettes[scheme];
    it(`${scheme} onDanger on danger is >= 4.5:1 (unread badge text)`, () => {
      expect(contrast(parse(t.onDanger).rgb, parse(t.danger).rgb)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${scheme} background on foreground is >= 4.5:1 (ink plate chip text)`, () => {
      expect(contrast(parse(t.background).rgb, parse(t.foreground).rgb)).toBeGreaterThanOrEqual(4.5);
    });
    for (const ground of ["surface", "surfaceElevated"] as const) {
      it(`${scheme} primaryDeep on ${ground} is >= 3:1 (selected-zone border)`, () => {
        expect(contrast(parse(t.primaryDeep).rgb, parse(t[ground] as string).rgb)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("theme contrast: status ink on its own soft tint", () => {
  for (const scheme of SCHEMES) {
    const t = palettes[scheme];
    for (const token of STATUS_TOKENS) {
      for (const ground of GROUNDS) {
        it(`${scheme} ${token} pill on ${ground} is >= 4.5:1`, () => {
          const status = t[token] as string;
          const fill = over(softColor(status, t), t[ground] as string);
          const ratio = contrast(parse(inkColor(status, t)).rgb, fill);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  it("text on the ink button fill (primary) stays readable in both themes", () => {
    // Clear makes `primary` the ink button (near-black light, near-white dark),
    // so `onAccent` on `primary` is now the most-used text pairing.
    for (const t of [palettes.light, palettes.dark]) {
      expect(contrast(parse(t.onAccent).rgb, parse(t.primary).rgb)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** The tokens the test renderer's ThemeProvider actually resolves. */
async function liveTokens(): Promise<ColorTokens> {
  let captured: ColorTokens | undefined;
  function Probe() {
    captured = useColors();
    return null;
  }
  await render(<Probe />);
  if (!captured) throw new Error("ThemeProvider did not provide tokens");
  return captured;
}

describe("components use the text-safe tokens", () => {
  it("ghost button text is primaryDeep, not primary", async () => {
    const colors = await liveTokens();
    await render(<Button testID="btn" title="Cancel" variant="ghost" onPress={jest.fn()} />);
    const label = screen.getByText("Cancel");
    const style = [label.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...(s || {}) }), {});
    expect(style.color).toBe(colors.primaryDeep);
  });

  it("input placeholders use muted, not faint", async () => {
    const colors = await liveTokens();
    await render(<Input testID="field" label="Email" value="" placeholder="you@lpu.edu.ph" onChangeText={jest.fn()} />);
    expect(screen.getByTestId("field").props.placeholderTextColor).toBe(colors.muted);
  });

  it("ink plate chip text inverts with the theme (light-mode zone codes were unreadable)", async () => {
    const colors = await liveTokens();
    await render(<PlateChip value="A1" />);
    const style = [screen.getByText("A1").props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...(s || {}) }), {});
    expect(style.color).toBe(colors.background);
  });

  it("plate chip shrinks instead of pushing a sibling badge off the row", async () => {
    await render(<PlateChip value="LONGCODE1234" testID="chip" />);
    expect(screen.getByTestId("chip")).toHaveStyle({ flexShrink: 1 });
  });

  it("soft plate chip text uses the primary ink token", async () => {
    const colors = await liveTokens();
    await render(<PlateChip value="B2" tone="soft" />);
    const style = [screen.getByText("B2").props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...(s || {}) }), {});
    expect(style.color).toBe(colors.primaryInk);
  });

  it("status badge text uses the ink token for its hue", async () => {
    const colors = await liveTokens();
    await render(
      <StatusBadge meta={{ label: "Full", icon: "ban", color: colors.danger }} testID="badge" />,
    );
    const label = screen.getByText("Full");
    const style = [label.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...(s || {}) }), {});
    expect(style.color).toBe(colors.dangerInk);
  });
});
