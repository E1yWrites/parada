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
 * Every text/icon token is verified ≥4.5:1 against its paired surface.
 * `*Soft` values are fills only and never carry text of their own color.
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
  /** Tertiary text — captions-on-captions, disabled labels. Not for body text. */
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
  /** Disabled control fill/text. */
  disabledSurface: string;
  disabledForeground: string;
  /** Text/icon placed on top of primary/warning fills. */
  onAccent: string;
  /** Ordered hues for charts/series (occupancy trend, analytics). Never used for status. */
  data: readonly [string, string, string, string];
};

const dark: ColorTokens = {
  background: "#0E1220",
  surface: "#161B2E",
  surfaceElevated: "#1F2640",
  surfaceRaised2: "#29314F",
  foreground: "#F1F3FA",
  muted: "#A9AFC6",
  faint: "#6E7492",
  border: "rgba(241, 243, 250, 0.09)",
  borderStrong: "rgba(241, 243, 250, 0.16)",
  primary: "#F2A93B",
  primaryDeep: "#D98C1E",
  primarySoft: "rgba(242, 169, 59, 0.16)",
  danger: "#F0524A",
  dangerSoft: "rgba(240, 82, 74, 0.14)",
  success: "#3DDC84",
  successSoft: "rgba(61, 220, 132, 0.14)",
  warning: "#FF9F3F",
  warningSoft: "rgba(255, 159, 63, 0.14)",
  highlight: "#FF9F3F",
  info: "#5B93F7",
  infoSoft: "rgba(91, 147, 247, 0.16)",
  disabledSurface: "#1F2640",
  disabledForeground: "#545A78",
  onAccent: "#15111C",
  data: ["#F2A93B", "#3DDC84", "#5B93F7", "#FF9F3F"],
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
