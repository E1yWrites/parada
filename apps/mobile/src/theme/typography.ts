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
 * and JetBrains Mono (plates/time/technical data).
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

export const fontSizes = {
  /** Hero banner numbers (elapsed). */
  display: 34,
  /** Screen titles. */
  hero: 32,
  /** Card titles. */
  title: 19,
  /** Section headers. */
  section: 20,
  /** Primary content. */
  body: 15,
  /** Labels/hints/table data. */
  caption: 12,
  /** Badge / tech labels. */
  micro: 10,
  /** Plate numbers / data values. */
  monoValue: 18,
} as const;

export const lineHeights = {
  display: 40,
  hero: 40,
  title: 26,
  section: 26,
  body: 22,
  caption: 16,
  micro: 12,
  monoValue: 24,
} as const;

export type FontToken = keyof typeof fonts;