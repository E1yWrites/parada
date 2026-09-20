import { Platform } from "react-native";
import { palettes, type ColorScheme } from "./colors";

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
 * PARADA frosted tokens — chrome/hero surfaces only (floating tab bar, pass
 * card). Dark mode frosts smoked navy glass over the ink ground with a faint
 * gold-tinted rim; light mode keeps a cool-white frost. Every consumer must
 * fall back to `fallbackColor` when `usePrefersReducedTransparency()` is
 * true.
 */
function build(scheme: ColorScheme): GlassTokens {
  const tokens = palettes[scheme];
  if (scheme === "dark") {
    return {
      hero: {
        tint: "dark",
        intensity: 55,
        overlayColor: "rgba(22, 27, 46, 0.7)",
        borderColor: "rgba(242, 169, 59, 0.14)",
        fallbackColor: tokens.surface,
      },
      chrome: {
        tint: "dark",
        intensity: 68,
        overlayColor: "rgba(14, 18, 32, 0.76)",
        borderColor: "rgba(241, 243, 250, 0.08)",
        fallbackColor: tokens.surface,
      },
    };
  }
  return {
    hero: {
      tint: "light",
      intensity: 50,
      overlayColor: "rgba(255, 255, 255, 0.78)",
      borderColor: "rgba(138, 90, 0, 0.12)",
      fallbackColor: tokens.surface,
    },
    chrome: {
      tint: "light",
      intensity: 70,
      overlayColor: "rgba(255, 255, 255, 0.85)",
      borderColor: "rgba(16, 20, 42, 0.06)",
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
