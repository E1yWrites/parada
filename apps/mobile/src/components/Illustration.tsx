import { useMemo } from "react";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

type Spec = { icon: IconName; ground: string; ink: string };

/** One icon per situation, on a soft disc of its status tone. */
function buildSpecs(colors: ColorTokens): Record<IllustrationName, Spec> {
  const brand = { ground: colors.primarySoft, ink: colors.primaryInk };
  const neutral = { ground: colors.surfaceElevated, ink: colors.muted };
  return {
    parking: { icon: "location", ground: colors.successSoft, ink: colors.successInk },
    zones: { icon: "grid", ...brand },
    reserve: { icon: "calendar", ground: colors.warningSoft, ink: colors.warningInk },
    shield: { icon: "shield-checkmark", ground: colors.successSoft, ink: colors.successInk },
    bell: { icon: "notifications", ...brand },
    vehicle: { icon: "car-sport", ...brand },
    history: { icon: "time-outline", ...neutral },
    offline: { icon: "cloud-offline", ground: colors.dangerSoft, ink: colors.dangerInk },
    navigate: { icon: "navigate", ...brand },
  };
}

type IllustrationProps = {
  name: IllustrationName;
  /** Outer frame diameter. */
  size?: number;
  testID?: string;
};

/** Icon for empty/error/onboarding moments, named by situation. Decorative: the text beside it carries the meaning. */
export function Illustration({ name, size = 120, testID }: IllustrationProps) {
  const colors = useColors();
  const specs = useMemo(() => buildSpecs(colors), [colors]);
  const spec = specs[name];
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: spec.ground,
        alignItems: "center",
        justifyContent: "center",
      }}>
      <Ionicons name={spec.icon} size={Math.round(size * 0.42)} color={spec.ink} />
    </View>
  );
}
