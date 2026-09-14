import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors, radii, shadows, softColor } from "@/src/theme";

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

type Spec = {
  icon: IconName;
  color: string;
  satellites: { icon: IconName; color: string }[];
};

/**
 * Icon-built scene illustrations (no raster assets in this repo yet). Each is
 * a large tinted disc, a raised white badge carrying the subject icon, and
 * two small satellite chips that name the context — the same three-layer
 * construction everywhere so empty states read as one family.
 */
const SPECS: Record<IllustrationName, Spec> = {
  parking: {
    icon: "car-sport",
    color: colors.primary,
    satellites: [
      { icon: "location", color: colors.success },
      { icon: "grid", color: colors.warning },
    ],
  },
  zones: {
    icon: "grid",
    color: colors.primary,
    satellites: [
      { icon: "checkmark-circle", color: colors.success },
      { icon: "car-sport", color: colors.foreground },
    ],
  },
  reserve: {
    icon: "calendar",
    color: colors.primary,
    satellites: [
      { icon: "time", color: colors.warning },
      { icon: "checkmark-circle", color: colors.success },
    ],
  },
  shield: {
    icon: "shield-checkmark",
    color: colors.success,
    satellites: [
      { icon: "car-sport", color: colors.primary },
      { icon: "location", color: colors.warning },
    ],
  },
  bell: {
    icon: "notifications",
    color: colors.primary,
    satellites: [
      { icon: "checkmark-done", color: colors.success },
      { icon: "time", color: colors.warning },
    ],
  },
  vehicle: {
    icon: "car-sport",
    color: colors.primary,
    satellites: [
      { icon: "add-circle", color: colors.success },
      { icon: "key", color: colors.warning },
    ],
  },
  history: {
    icon: "hourglass",
    color: colors.primary,
    satellites: [
      { icon: "car-sport", color: colors.foreground },
      { icon: "checkmark-done", color: colors.success },
    ],
  },
  offline: {
    icon: "cloud-offline",
    color: colors.danger,
    satellites: [
      { icon: "refresh", color: colors.primary },
      { icon: "wifi", color: colors.muted },
    ],
  },
  navigate: {
    icon: "navigate",
    color: colors.primary,
    satellites: [
      { icon: "location", color: colors.danger },
      { icon: "car-sport", color: colors.foreground },
    ],
  },
};

type IllustrationProps = {
  name: IllustrationName;
  /** Outer disc diameter. */
  size?: number;
  testID?: string;
};

export function Illustration({ name, size = 120, testID }: IllustrationProps) {
  const spec = SPECS[name];
  const badge = Math.round(size * 0.5);
  const satellite = Math.round(size * 0.27);
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }]}>
      <View
        style={[
          styles.disc,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: softColor(spec.color) },
        ]}
      />
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: Math.round(badge * 0.32) }]}>
        <Ionicons name={spec.icon} size={Math.round(badge * 0.55)} color={spec.color} />
      </View>
      {spec.satellites.map((item, index) => (
        <View
          key={item.icon}
          style={[
            styles.satellite,
            {
              width: satellite,
              height: satellite,
              borderRadius: Math.round(satellite * 0.36),
              backgroundColor: colors.surface,
            },
            index === 0
              ? { top: Math.round(size * 0.08), right: Math.round(size * 0.06) }
              : { bottom: Math.round(size * 0.1), left: Math.round(size * 0.04) },
          ]}>
          <Ionicons name={item.icon} size={Math.round(satellite * 0.55)} color={item.color} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
  disc: {
    position: "absolute",
  },
  badge: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    ...shadows.card,
  },
  satellite: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
});
