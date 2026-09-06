/**
 * PARADA design tokens — colors.
 *
 * Sophisticated Playful light palette: charcoal ink on an off-white canvas,
 * with a playful cardinal red for actions and a calm gray-green for chrome.
 */
export const colors = {
  /** Off-white canvas. Primary app background. */
  background: "#EEEBE3",
  /** White. Base surface for cards, bars, inputs. */
  surface: "#FFFFFF",
  /** Raised/soft surface for tracks, chips, icon containers. */
  surfaceElevated: "#F5F2EA",
  /** Charcoal ink. Primary foreground text + dark navigation surfaces. */
  foreground: "#171E19",
  /** Gray-green. Secondary/muted foreground text. */
  muted: "#5F6F69",
  /** Gray-green hairline borders and dividers. */
  border: "rgba(183, 198, 194, 0.35)",
  /** Cardinal red. Primary brand + primary actions + plate accents. */
  primary: "#CA0013",
  /** Darker red. Destructive/critical emphasis. */
  danger: "#A90E18",
  /** Deep green. Available / success semantic color. */
  success: "#2E7D5B",
  /** Amber. Pending/premium/highlight accents. */
  highlight: "#B47A1F",
  /** Informational semantic color (shares gray-green family). */
  info: "#5F6F69",
  /** Warning semantic color (shares amber highlight). */
  warning: "#B47A1F",
  /** Text/icon color placed on top of primary/dark surfaces. */
  onAccent: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;