import { Platform } from "react-native";
import { colors } from "./colors";

export type ShadowPreset = "card" | "glowOrange" | "glowGold" | "none";

/**
 * PARADA elevation model. Soft dark shadows for face-down depth, plus
 * restrained colored glows for ambient/brand emphasis. Android uses
 * `elevation` (material shadow is on by default in edge-to-edge).
 */
export const shadows: Record<
  ShadowPreset,
  {
    shadowColor?: string;
    shadowOffset?: { width: number; height: number };
    shadowOpacity?: number;
    shadowRadius?: number;
    elevation?: number;
  }
> = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 4,
  },
  glowOrange: {
    shadowColor: colors.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  glowGold: {
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: Platform.OS === "android" ? 0 : undefined,
  },
};