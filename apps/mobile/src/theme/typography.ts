import {
  SpaceGrotesk_400Regular,
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
 * PARADA type ramp — Space Grotesk (display), Inter (UI + body),
 * JetBrains Mono (data/plates/time/technical labels).
 *
 * The google-fonts constants are the actual `.ttf` assets (needed by
 * `useFonts`); `fontFamily` uses the registered human-readable names, which
 * are exactly the constant identifiers (e.g. "SpaceGrotesk_700Bold").
 */
export const fonts = {
  heading: "SpaceGrotesk_700Bold",
  headingMedium: "SpaceGrotesk_600SemiBold",
  heading500: "SpaceGrotesk_500Medium",
  headingRegular: "SpaceGrotesk_400Regular",
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
  SpaceGrotesk_400Regular,
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

export const fontSizes = {
  /** Banners/headline numbers. */
  display: 44,
  /** Screen titles. */
  hero: 30,
  /** Card titles. */
  title: 20,
  /** Section headers. */
  section: 16,
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
  display: 48,
  hero: 38,
  title: 28,
  section: 22,
  body: 22,
  caption: 16,
  micro: 12,
  monoValue: 24,
} as const;

export type FontToken = keyof typeof fonts;