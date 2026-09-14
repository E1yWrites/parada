import { StyleSheet, View } from "react-native";
import { colors, radii } from "@/src/theme";
import { Text } from "./Text";

/** Initials from a display name ("Alex Driver" → "AD"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

type AvatarProps = {
  name: string | null | undefined;
  size?: number;
  testID?: string;
};

/** Blue initials tile that stands in for a profile photo. */
export function Avatar({ name, size = 40, testID }: AvatarProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel={name ? `${name} account` : "Account"}
      style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.34) }]}>
      <Text variant={size >= 48 ? "title" : "bodySemi"} color={colors.onAccent} style={styles.text}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radii.md,
  },
  text: {
    letterSpacing: 0.5,
  },
});
