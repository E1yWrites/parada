import { Platform } from "react-native";
import type { ColorScheme } from "./colors";

export type ShadowPreset = "card" | "pill" | "none";

type ShadowStyle = {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
};

export type ShadowTokens = Record<ShadowPreset, ShadowStyle>;

/**
 * PARADA elevation model. A dark, near-black ground makes a classic soft
 * drop shadow invisible, so dark elevation reads through a faint upward
 * highlight instead (`elevation`/native shadow kept minimal); light mode
 * keeps a conventional ink-tinted offset shadow tuned to the warm paper.
 * Android uses `elevation` in both cases (native shadow color is ignored
 * there below API 28, so the highlight border on cards carries dark-mode
 * elevation on Android).
 */
function build(scheme: ColorScheme): ShadowTokens {
  if (scheme === "dark") {
    return {
      card: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
        elevation: 4,
      },
      pill: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.6,
        shadowRadius: 32,
        elevation: 12,
      },
      none: {
        shadowColor: "transparent",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: Platform.OS === "android" ? 0 : undefined,
      },
    };
  }
  return {
    card: {
      shadowColor: "#10142A",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 3,
    },
    pill: {
      shadowColor: "#10142A",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.16,
      shadowRadius: 28,
      elevation: 10,
    },
    none: {
      shadowColor: "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: Platform.OS === "android" ? 0 : undefined,
    },
  };
}

export function getShadows(scheme: ColorScheme): ShadowTokens {
  return build(scheme);
}

/** Static dark fallback for the rare module-level constant. Prefer `useThemeShadows()`. */
export const shadows: ShadowTokens = build("dark");
