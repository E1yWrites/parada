import { Platform } from "react-native";

export type ShadowPreset = "card" | "pill" | "none";

/**
 * PARADA elevation model. Soft face-down shadows at low opacity; never
 * colored glows. Android uses `elevation` (material shadow on by default).
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  pill: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: Platform.OS === "android" ? 0 : undefined,
  },
};