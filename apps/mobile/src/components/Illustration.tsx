import { useMemo } from "react";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Mascot, type MascotVariant } from "./Mascot";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type IllustrationName =
  | "parking"
  | "zones"
  | "reserve"
  | "shield"
  | "bell"
  | "vehicle"
  | "history"
  | "offline"
  | "navigate";

type Spec = { icon: IconName; color: string; variant?: MascotVariant };

/**
 * Scene-per-name mapping onto the mascot: one canonical image (a specific
 * head crop where one already exists for the context), a single accent
 * badge naming the situation — replaces the old icon-in-disc-with-two-
 * satellites scene, which repeated everywhere and read as generic.
 */
function buildSpecs(colors: ColorTokens): Record<IllustrationName, Spec> {
  return {
    parking: { icon: "location", color: colors.success },
    zones: { icon: "grid", color: colors.primaryDeep },
    reserve: { icon: "calendar", color: colors.warning },
    shield: { icon: "shield-checkmark", color: colors.success },
    bell: { icon: "notifications", color: colors.primaryDeep, variant: "notifications" },
    vehicle: { icon: "car-sport", color: colors.primaryDeep },
    history: { icon: "hourglass", color: colors.muted, variant: "history" },
    offline: { icon: "cloud-offline", color: colors.danger },
    navigate: { icon: "navigate", color: colors.primaryDeep },
  };
}

type IllustrationProps = {
  name: IllustrationName;
  /** Outer frame diameter. */
  size?: number;
  testID?: string;
};

/** Scene illustration for empty/error/onboarding moments — a mascot pose named by situation. */
export function Illustration({ name, size = 120, testID }: IllustrationProps) {
  const colors = useColors();
  const specs = useMemo(() => buildSpecs(colors), [colors]);
  const spec = specs[name];
  return (
    <Mascot variant={spec.variant} accentIcon={spec.icon} accentColor={spec.color} size={size} testID={testID} />
  );
}
