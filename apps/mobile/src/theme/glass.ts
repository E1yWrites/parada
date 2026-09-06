import { Platform } from "react-native";
import { colors } from "./colors";

export type GlassPreset = "hero" | "chrome";

/**
 * PARADA glass tokens — used only by chrome/hero surfaces (floating tab bar,
 * hero/summary cards). Every consumer must fall back to `fallbackColor` when
 * `usePrefersReducedTransparency()` is true.
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
  /** Hero/summary cards on the light gradient-mesh background. */
  hero: {
    tint: "light",
    intensity: 40,
    overlayColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.5)",
    fallbackColor: colors.surface,
  },
  /** Floating tab bar — dark frosted glass, replacing the old solid fill. */
  chrome: {
    tint: "dark",
    intensity: 60,
    overlayColor: "rgba(23, 30, 25, 0.35)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    fallbackColor: colors.foreground,
  },
};

/**
 * Android's BlurView only blurs real content with this experimental native
 * method; iOS ignores the prop and always blurs natively.
 */
export const blurMethod: "dimezisBlurView" | undefined =
  Platform.OS === "android" ? "dimezisBlurView" : undefined;
