import { Platform } from "react-native";
import { palettes, withAlpha, type ColorScheme } from "./colors";

export type GlassPreset = "hero" | "chrome";

type GlassStyle = {
  tint: "light" | "dark";
  intensity: number;
  overlayColor: string;
  borderColor: string;
  fallbackColor: string;
};

export type GlassTokens = Record<GlassPreset, GlassStyle>;

/**
 * PARADA "Clear" frost — chrome/hero surfaces only (floating tab bar, hero
 * cards, sheets, pop-ups), always over the WaveGrid ground so the blur has
 * structure to show. Every value is derived from the live palette, so the frost always
 * matches the current ground and accent (no retired navy/gold literals).
 * Every consumer must fall back to `fallbackColor` when
 * `usePrefersReducedTransparency()` is true.
 */
function build(scheme: ColorScheme): GlassTokens {
  const tokens = palettes[scheme];
  if (scheme === "dark") {
    return {
      hero: {
        tint: "dark",
        intensity: 60,
        overlayColor: withAlpha(tokens.surfaceRaised2, 0.42),
        borderColor: "rgba(255, 255, 255, 0.16)",
        fallbackColor: tokens.surface,
      },
      chrome: {
        tint: "dark",
        intensity: 70,
        overlayColor: withAlpha(tokens.surface, 0.62),
        borderColor: "rgba(255, 255, 255, 0.12)",
        fallbackColor: tokens.surface,
      },
    };
  }
  return {
    hero: {
      tint: "light",
      intensity: 55,
      overlayColor: withAlpha(tokens.surface, 0.62),
      borderColor: "rgba(255, 255, 255, 0.85)",
      fallbackColor: tokens.surface,
    },
    chrome: {
      tint: "light",
      intensity: 70,
      overlayColor: withAlpha(tokens.surface, 0.72),
      borderColor: "rgba(255, 255, 255, 0.85)",
      fallbackColor: tokens.surface,
    },
  };
}

export function getGlass(scheme: ColorScheme): GlassTokens {
  return build(scheme);
}

/** Static dark fallback for the rare module-level constant. Prefer `useThemeGlass()`. */
export const glass: GlassTokens = build("dark");

/**
 * Android's BlurView only blurs real content with this experimental native
 * method; iOS ignores the prop and always blurs natively.
 */
export const blurMethod: "dimezisBlurView" | undefined =
  Platform.OS === "android" ? "dimezisBlurView" : undefined;
