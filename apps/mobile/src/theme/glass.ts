import { Platform } from "react-native";
import { colors } from "./colors";

export type GlassPreset = "hero" | "chrome";

/**
 * PARADA frosted tokens — used only by chrome/hero surfaces (floating tab
 * bar, pass/hero cards). Both presets are light: the blur softens the blue
 * washes behind them into a subtle gradient. Every consumer must fall back
 * to `fallbackColor` when `usePrefersReducedTransparency()` is true.
 */
export const glass: Record<
  GlassPreset,
  {
    tint: "light" | "dark";
    intensity: number;
    overlayColor: string;
    borderColor: string;
    fallbackColor: string;
  }
> = {
  /** Pass / hero cards: white frost over a blue wash. */
  hero: {
    tint: "light",
    intensity: 50,
    overlayColor: "rgba(255, 255, 255, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.9)",
    fallbackColor: colors.surface,
  },
  /** Floating tab bar — white frosted chrome. */
  chrome: {
    tint: "light",
    intensity: 70,
    overlayColor: "rgba(255, 255, 255, 0.82)",
    borderColor: "rgba(15, 27, 45, 0.06)",
    fallbackColor: colors.surface,
  },
};

/**
 * Android's BlurView only blurs real content with this experimental native
 * method; iOS ignores the prop and always blurs natively.
 */
export const blurMethod: "dimezisBlurView" | undefined =
  Platform.OS === "android" ? "dimezisBlurView" : undefined;
