import { Platform } from "react-native";

export type ShadowPreset = "card" | "pill" | "none";

/**
 * PARADA elevation model. Soft, offset, low-opacity shadows tinted with the
 * ink color so cards sit on the cool ground instead of floating grey.
 * Android uses `elevation`.
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
    shadowColor: "#0F1B2D",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 3,
  },
  pill: {
    shadowColor: "#0F1B2D",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
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
