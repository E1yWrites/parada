import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

/**
 * PARADA "Clear" type: Inter only — the closest open face to SF Pro, already
 * bundled. Headings are Inter Bold/SemiBold with tight display tracking;
 * plates, codes and numbers use Inter SemiBold/Bold with tabular figures
 * (set where they render) instead of a monospace costume. The `heading*` and
 * `mono*` token names are kept so every call site keeps working.
 */
export const fonts = {
  heading: "Inter_700Bold",
  headingMedium: "Inter_600SemiBold",
  heading500: "Inter_600SemiBold",
  headingRegular: "Inter_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "Inter_600SemiBold",
  monoRegular: "Inter_500Medium",
  monoBold: "Inter_700Bold",
} as const;

/** Map of family name → `.ttf` asset, passed to `useFonts`. */
export const fontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} as const;

/**
 * Size ramp. Steps are deliberately far apart so hierarchy reads at a glance
 * (and from across a room during a demo): 40 / 30 / 20 / 17 / 15 / 13 / 11.
 */
export const fontSizes = {
  /** Hero numbers (elapsed clock, free-space count). */
  display: 48,
  /** Screen titles and the pass card's zone name. */
  hero: 34,
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
  display: 52,
  hero: 41,
  title: 26,
  section: 24,
  body: 22,
  caption: 18,
  micro: 14,
  monoValue: 24,
} as const;

/** Negative tracking for display sizes; positive tracking for tiny caps. */
export const letterSpacing = {
  display: -1.4,
  hero: -0.9,
  title: -0.3,
  micro: 0.8,
} as const;

export type FontToken = keyof typeof fonts;
