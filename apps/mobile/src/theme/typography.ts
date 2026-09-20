import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

/**
 * PARADA type ramp — Space Grotesk (display/headings, geometric, echoes the
 * logo's angular character) + Inter (body/UI) + JetBrains Mono strictly for
 * data: plates, zone codes, timestamps.
 *
 * The google-fonts constants are the actual `.ttf` assets (needed by
 * `useFonts`); `fontFamily` uses the registered human-readable names, which
 * are exactly the constant identifiers (e.g. "SpaceGrotesk_700Bold"). Space
 * Grotesk tops out at 700 (no black/900 cut); at display size it still reads
 * heavy, so the ramp leans on scale rather than a heavier weight that
 * doesn't exist for this family.
 */
export const fonts = {
  heading: "SpaceGrotesk_700Bold",
  headingMedium: "SpaceGrotesk_600SemiBold",
  heading500: "SpaceGrotesk_600SemiBold",
  headingRegular: "SpaceGrotesk_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoRegular: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",
} as const;

/** Map of family name → `.ttf` asset, passed to `useFonts`. */
export const fontAssets = {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} as const;

/**
 * Size ramp. Steps are deliberately far apart so hierarchy reads at a glance
 * (and from across a room during a demo): 40 / 30 / 20 / 17 / 15 / 13 / 11.
 */
export const fontSizes = {
  /** Hero numbers (elapsed clock, free-space count). */
  display: 40,
  /** Screen titles and the pass card's zone name. */
  hero: 30,
  /** Card titles. */
  title: 20,
  /** Section headers. */
  section: 17,
  /** Primary content. */
  body: 15,
  /** Labels/hints/table data. */
  caption: 13,
  /** Badge / field labels. */
  micro: 11,
  /** Plate numbers / data values. */
  monoValue: 18,
} as const;

export const lineHeights = {
  display: 44,
  hero: 36,
  title: 26,
  section: 24,
  body: 22,
  caption: 18,
  micro: 14,
  monoValue: 24,
} as const;

/** Negative tracking for display sizes; positive tracking for tiny caps. */
export const letterSpacing = {
  display: -0.8,
  hero: -0.6,
  title: -0.3,
  micro: 0.8,
} as const;

export type FontToken = keyof typeof fonts;
