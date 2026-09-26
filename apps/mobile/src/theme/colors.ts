/**
 * PARADA design tokens — colors.
 *
 * "Attendant" world: deep navy grounds — the mascot's own uniform — with a
 * warm badge-gold action, an azure "active/assigned" accent (the mascot's own
 * P-sign blue), and a barrier-stripe red for danger/full. Dark is the primary
 * register; Light is an independently tuned counterpart (cool paper, not a
 * literal inversion) built from the same token names so every component that
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
  /** PARADA badge-gold. Brand + the one filled action per screen. */
  primary: string;
  /** Pressed / text-safe emphasized gold. */
  primaryDeep: string;
  /** Gold tint for chips, selected rows, washes. */
  primarySoft: string;
  /** Barrier-stripe red. Destructive/critical/full/offline emphasis. */
  danger: string;
  dangerSoft: string;
  /** Signal green. Available/success/confirmed. */
  success: string;
  successSoft: string;
  /** Amber-orange. Low-availability/pending — distinct from brand gold. */
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
  /** Ordered hues for charts/series (occupancy trend, analytics). Never used for status. */
  data: readonly [string, string, string, string];
};

// Warm-sunset repaint of the dark register (user-supplied reference palette:
// cream FFEBD2 → light-orange FFA364 → orange FC7643 → rust AF4F41 → navy
// 273248), swapped in for the original cold navy/gold dark theme. Navy
// ground lightened (#0E1220 → #273248) and gold accent shifted to the
// warmer orange from the reference; azure/red/green re-tuned to clear
// 4.5:1 against the new, lighter ground. Rust AF4F41 itself fails text
// contrast here (2.46:1) so it isn't used as a token value directly — its
// role in the reference (a pressed/deep accent) is filled by primaryDeep.
const dark: ColorTokens = {
  background: "#273248",
  surface: "#2F3B54",
  surfaceElevated: "#38455F",
  surfaceRaised2: "#414F6C",
  foreground: "#FFEBD2",
  muted: "#C7BBAE",
  faint: "#9A9086",
  border: "rgba(255, 235, 210, 0.09)",
  borderStrong: "rgba(255, 235, 210, 0.16)",
  primary: "#FC7643",
  primaryDeep: "#FFA364",
  primarySoft: "rgba(252, 118, 67, 0.18)",
  danger: "#FF8478",
  dangerSoft: "rgba(255, 132, 120, 0.14)",
  success: "#3DDC84",
  successSoft: "rgba(61, 220, 132, 0.14)",
  warning: "#FFC65C",
  warningSoft: "rgba(255, 198, 92, 0.14)",
  highlight: "#FFC65C",
  info: "#82ACFF",
  infoSoft: "rgba(130, 172, 255, 0.16)",
  primaryInk: "#FDB69B",
  dangerInk: "#FFB2AA",
  successInk: "#62E39B",
  warningInk: "#FFC65C",
  infoInk: "#B2CCFF",
  disabledSurface: "#38455F",
  disabledForeground: "#A79D8E",
  onAccent: "#15111C",
  data: ["#FC7643", "#3DDC84", "#82ACFF", "#FFC65C"],
};

const light: ColorTokens = {
  background: "#F3F5FC",
  surface: "#FFFFFF",
  surfaceElevated: "#E7EBF7",
  surfaceRaised2: "#FFFFFF",
  foreground: "#10142A",
  muted: "#565C7A",
  faint: "#8A8FAE",
  border: "rgba(16, 20, 42, 0.10)",
  borderStrong: "rgba(16, 20, 42, 0.14)",
  primary: "#F2A93B",
  // Deliberately darker than dark mode's primaryDeep: raw badge-gold only
  // reaches ~2.1:1 as text on this cool-paper surface, so the text-safe
  // "deep" variant has to sit further from the fill gold in light mode than
  // it does in dark mode, where the deep-navy ground gives gold plenty of
  // room. Verified ≥4.5:1 against both `surface` and `background`.
  primaryDeep: "#8A5A00",
  primarySoft: "rgba(242, 169, 59, 0.20)",
  danger: "#B3261E",
  dangerSoft: "rgba(179, 38, 30, 0.10)",
  success: "#146C43",
  successSoft: "rgba(20, 108, 67, 0.10)",
  warning: "#8A4B00",
  warningSoft: "rgba(138, 75, 0, 0.16)",
  highlight: "#8A4B00",
  info: "#1D4ED8",
  infoSoft: "rgba(29, 78, 216, 0.12)",
  primaryInk: "#805A1F",
  dangerInk: "#B3261E",
  successInk: "#146C43",
  warningInk: "#874A00",
  infoInk: "#1D4ED8",
  disabledSurface: "#E7EBF7",
  disabledForeground: "#9BA0BE",
  onAccent: "#15111C",
  data: ["#8A5A00", "#146C43", "#1D4ED8", "#8A4B00"],
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
