import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from "@expo-google-fonts/nunito";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

/**
 * PARADA type ramp — Nunito (display + UI, friendly rounded grotesque)
 * and JetBrains Mono strictly for data: plates, zone codes, timestamps.
 *
 * The google-fonts constants are the actual `.ttf` assets (needed by
 * `useFonts`); `fontFamily` uses the registered human-readable names, which
 * are exactly the constant identifiers (e.g. "Nunito_900Black").
 */
export const fonts = {
  heading: "Nunito_900Black",
  headingMedium: "Nunito_800ExtraBold",
  heading500: "Nunito_700Bold",
  headingRegular: "Nunito_600SemiBold",
  body: "Nunito_400Regular",
  bodyMedium: "Nunito_500Medium",
  bodySemi: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoRegular: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",
} as const;

/** Map of family name → `.ttf` asset, passed to `useFonts`. */
export const fontAssets = {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
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
