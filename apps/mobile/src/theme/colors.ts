/**
 * PARADA design tokens — colors.
 *
 * "Gate pass" world: slate ink on a cool off-white ground, electric blue as
 * the single brand accent, and one tinted family per parking status so a
 * state is always readable from its color band, its icon and its label.
 *
 * Every text color listed here reaches ≥4.5:1 on `surface` (white); the
 * `*Soft` values are fills only and never carry text of their own color.
 */
export const colors = {
  /** Cool off-white canvas. Primary app background. */
  background: "#F4F6FB",
  /** White. Base surface for cards, bars, inputs. */
  surface: "#FFFFFF",
  /** Blue-tinted raised surface for tracks, chips, icon tiles. */
  surfaceElevated: "#EEF2FA",
  /** Slate ink. Primary foreground text. */
  foreground: "#0F1B2D",
  /** Slate. Secondary/muted foreground text (5.5:1 on white). */
  muted: "#5B6B82",
  /** Hairline borders and dividers. */
  border: "rgba(15, 27, 45, 0.08)",
  /** Electric blue. Brand + the one filled action per screen (5.1:1 on white). */
  primary: "#1E5EFF",
  /** Pressed / emphasized blue. */
  primaryDeep: "#1546C9",
  /** Blue tint for chips, selected rows and washes. */
  primarySoft: "#E8EFFF",
  /** Coral. Destructive/critical emphasis (4.7:1 on white). */
  danger: "#D9342F",
  dangerSoft: "#FDE9E8",
  /** Deep mint. Available / success (5.0:1 on white). */
  success: "#0B7F4F",
  successSoft: "#E1F6EC",
  /** Amber. Low availability / pending (5.0:1 on white). */
  warning: "#A35F04",
  warningSoft: "#FFF3DB",
  /** Amber highlight for fees and secondary emphasis (same family as warning). */
  highlight: "#A35F04",
  /** Informational semantic color (shares the brand blue). */
  info: "#1E5EFF",
  /** Text/icon color placed on top of primary/dark surfaces. */
  onAccent: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Tinted background for a status color. Every semantic color has a hand-tuned
 * soft fill; anything else falls back to a 12% alpha of the color itself.
 */
export function softColor(color: string): string {
  switch (color) {
    case colors.primary:
    case colors.info:
      return colors.primarySoft;
    case colors.danger:
      return colors.dangerSoft;
    case colors.success:
      return colors.successSoft;
    case colors.warning:
    case colors.highlight:
      return colors.warningSoft;
    case colors.muted:
      return colors.surfaceElevated;
    default:
      return withAlpha(color, 0.12);
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
