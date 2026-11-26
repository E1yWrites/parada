/**
 * PARADA design tokens — colors.
 *
 * "Clear" world (Apple-like glass): a cool paper ground (light) or near-black
 * (dark) with a moving wave-grid behind frosted surfaces. `primary` is the
 * ink button — near-black in light, near-white in dark — and PARADA orange is
 * the data/accent colour (`primaryDeep` as text, `primarySoft` as wash,
 * `data[0]`). Blue = "yours / held", green = free/success, red = full/danger.
 * Both themes share the token names so every component that
 * reads `colors.foo` works unmodified in both themes — call sites keep
 * reading `colors.X`; only the source of `colors` changes (see `useColors()`
 * in `@/src/providers/ThemeProvider`).
 *
 * Text tokens (`foreground`, `muted`, `primaryDeep`, the `*Ink` tokens) are
 * ≥4.5:1 on `background`, `surface` and `surfaceElevated`; the ratios are
 * asserted in `__tests__/themeContrast.test.ts`. `faint` is NOT a text-safe
 * token (≈3:1) — dividers, decorative icons and disabled glyphs only.
 * `*Soft` values are fills only; text on a soft fill uses `inkColor()`.
 */
export type ColorScheme = "dark" | "light";

export type ColorTokens = {
  /** App ground. */
  background: string;
  /** Card/panel/input surface. */
  surface: string;
  /** Raised nested surface: tracks, tinted rows, disabled fields. */
  surfaceElevated: string;
  /** A second elevation step above `surfaceElevated` (sheets, popovers). */
  surfaceRaised2: string;
  /** Primary text/icon. */
  foreground: string;
  /** Secondary/muted text (≥4.5:1). */
  muted: string;
  /** Non-text only: dividers, decorative icons. Fails 4.5:1 — never text or placeholders. */
  faint: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Stronger hairline for structural cuts between sections. */
  borderStrong: string;
  /** Ink button fill — the one filled action per screen (near-black light, near-white dark). */
  primary: string;
  /** Text-safe PARADA orange: active tab, emphasis, links. */
  primaryDeep: string;
  /** Orange wash for chips, selected rows, accents. */
  primarySoft: string;
  /** Barrier-stripe red. Destructive/critical/full/offline emphasis. */
  danger: string;
  dangerSoft: string;
  /** Signal green. Available/success/confirmed. */
  success: string;
  successSoft: string;
  /** Amber-orange. Low-availability/pending — distinct from the orange accent. */
  warning: string;
  warningSoft: string;
  /** Fee/secondary-emphasis highlight (same family as warning). */
  highlight: string;
  /** Azure — active/assigned/"yours right now" (the mascot's own P-sign blue). */
  info: string;
  infoSoft: string;
  /** Text/icon on `primarySoft` (≥4.5:1 over every ground). */
  primaryInk: string;
  /** Text/icon on `dangerSoft`. */
  dangerInk: string;
  /** Text/icon on `successSoft`. */
  successInk: string;
  /** Text/icon on `warningSoft`. */
  warningInk: string;
  /** Text/icon on `infoSoft`. */
  infoInk: string;
  /** Disabled control fill/text. */
  disabledSurface: string;
  disabledForeground: string;
  /** Text/icon placed on top of primary/warning fills. */
  onAccent: string;
  /** Text/icon placed on top of a solid `danger` fill (e.g. the unread badge). */
  onDanger: string;
  /** Ordered hues for charts/series (occupancy trend, analytics). Never used for status. */
  data: readonly [string, string, string, string];
};

const dark: ColorTokens = {
  background: "#07080C",
  surface: "#15171E",
  surfaceElevated: "#1F222B",
  surfaceRaised2: "#282B36",
  foreground: "#F4F5F7",
  muted: "#A6ACBA",
  faint: "#6E7482",
  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  primary: "#F4F5F7",
  primaryDeep: "#FF9A6B",
  primarySoft: "rgba(252, 118, 67, 0.18)",
  danger: "#FF6B6B",
  dangerSoft: "rgba(255, 107, 107, 0.14)",
  success: "#4ADE80",
  successSoft: "rgba(74, 222, 128, 0.14)",
  warning: "#FFB340",
  warningSoft: "rgba(255, 179, 64, 0.14)",
  highlight: "#FFB340",
  info: "#7FB2FF",
  infoSoft: "rgba(127, 178, 255, 0.16)",
  primaryInk: "#FFB08F",
  dangerInk: "#FFA3A3",
  successInk: "#6EE7A0",
  warningInk: "#FFC46B",
  infoInk: "#A9CBFF",
  disabledSurface: "#1F222B",
  disabledForeground: "#8A909E",
  onAccent: "#07080C",
  onDanger: "#07080C",
  data: ["#FC7643", "#4ADE80", "#7FB2FF", "#FFB340"],
};

const light: ColorTokens = {
  background: "#E9ECF2",
  surface: "#FFFFFF",
  surfaceElevated: "#EEF0F5",
  surfaceRaised2: "#FFFFFF",
  foreground: "#111318",
  muted: "#545A68",
  faint: "#8E94A2",
  border: "rgba(17, 19, 24, 0.08)",
  borderStrong: "rgba(17, 19, 24, 0.14)",
  primary: "#111318",
  primaryDeep: "#B23C0C",
  primarySoft: "rgba(252, 118, 67, 0.16)",
  danger: "#C4112B",
  dangerSoft: "rgba(196, 17, 43, 0.10)",
  success: "#11713A",
  successSoft: "rgba(17, 113, 58, 0.10)",
  warning: "#9E4F00",
  warningSoft: "rgba(158, 79, 0, 0.14)",
  highlight: "#9E4F00",
  info: "#0A60CC",
  infoSoft: "rgba(10, 96, 204, 0.10)",
  primaryInk: "#9A3410",
  dangerInk: "#B0102A",
  successInk: "#0F6634",
  warningInk: "#874400",
  infoInk: "#0A57B8",
  disabledSurface: "#E3E6EC",
  disabledForeground: "#8E94A2",
  onAccent: "#FFFFFF",
  onDanger: "#FFFFFF",
  data: ["#B23C0C", "#11713A", "#0A60CC", "#9E4F00"],
};

/** Both themes, keyed by scheme. */
export const palettes: Record<ColorScheme, ColorTokens> = { dark, light };

/**
 * Static default (dark) — module-level fallback only, for the rare constant
 * that must exist before the theme provider mounts. Screens/components read
 * live tokens from `useColors()` (`@/src/providers/ThemeProvider`), not this.
 */
export const colors = dark;

export type ColorToken = keyof ColorTokens;

/** Tinted background for a status color, resolved against a specific token set. */
export function softColor(color: string, tokens: ColorTokens = colors): string {
  switch (color) {
    case tokens.primary:
      return tokens.primarySoft;
    case tokens.info:
      return tokens.infoSoft;
    case tokens.danger:
      return tokens.dangerSoft;
    case tokens.success:
      return tokens.successSoft;
    case tokens.warning:
    case tokens.highlight:
      return tokens.warningSoft;
    case tokens.muted:
    case tokens.faint:
      return tokens.surfaceElevated;
    default:
      return withAlpha(color, 0.14);
  }
}

/**
 * Text/icon color for content drawn on `softColor(color)`. A status hue on its
 * own soft tint falls below 4.5:1 (e.g. dark danger 3.83, light primary 1.75),
 * so pills and stamps use the matching `*Ink` token instead.
 */
export function inkColor(color: string, tokens: ColorTokens = colors): string {
  switch (color) {
    case tokens.primary:
    case tokens.primaryDeep:
      return tokens.primaryInk;
    case tokens.danger:
      return tokens.dangerInk;
    case tokens.success:
      return tokens.successInk;
    case tokens.warning:
    case tokens.highlight:
      return tokens.warningInk;
    case tokens.info:
      return tokens.infoInk;
    default:
      return color;
  }
}

/** Appends an alpha channel to a 6-digit hex color. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
