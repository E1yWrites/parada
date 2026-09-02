/**
 * PARADA design tokens — colors.
 *
 * Dark-only brand. The palette mirrors the PARADA brand system used across
 * the web dashboard: a near-black void background, "dark matter" surfaces,
 * Bitcoin-orange signatures and digital-gold accents.
 */
export const colors = {
  /** True void. Primary app background. */
  background: "#030304",
  /** Dark matter. Base surface for cards, bars, inputs. */
  surface: "#0F1115",
  /** Raised surface (modals, elevated cards). */
  surfaceElevated: "#141821",
  /** Primary foreground text. */
  foreground: "#FFFFFF",
  /** Secondary/muted foreground text. */
  muted: "#94A3B8",
  /** Hairline borders and dividers. */
  border: "#1E293B",
  /** Bitcoin orange. Primary brand + primary actions. */
  orange: "#F7931A",
  /** Burnt orange. Full/alert states and destructive emphasis. */
  burntOrange: "#EA580C",
  /** Digital gold. Focus, stars, premium accents. */
  gold: "#FFD600",
  /** Available / success semantic color. */
  success: "#34D399",
  /** Error / destructive semantic color. */
  danger: "#FB7185",
  /** Informational semantic color. */
  info: "#60A5FA",
  /** Warning semantic color. */
  warning: "#FBBF24",
  /** Text color placed on top of orange/gold (kept dark for contrast). */
  onAccent: "#1A0F00",
} as const;

export type ColorToken = keyof typeof colors;