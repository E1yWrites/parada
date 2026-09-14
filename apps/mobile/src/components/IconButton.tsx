import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors, motion, radii, touchTarget } from "@/src/theme";
import { Text } from "./Text";

type IconButtonProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Screen-reader name; icon buttons never carry visible text. */
  accessibilityLabel: string;
  onPress: () => void;
  /** Small count bubble (e.g. unread notifications). Values above 9 render as "9+". */
  badge?: number;
  /** `filled` is the blue primary tile; `surface` a white circle; `plain` no chrome. */
  tone?: "surface" | "filled" | "plain";
  size?: number;
  testID?: string;
};

/** 44pt circular icon control used for back, close, bell and similar. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  badge,
  tone = "surface",
  size = 20,
  testID,
}: IconButtonProps) {
  const color = tone === "filled" ? colors.onAccent : colors.foreground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${accessibilityLabel}, ${badge} unread` : accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        tone === "surface" ? styles.surface : undefined,
        tone === "filled" ? styles.filled : undefined,
        pressed ? styles.pressed : undefined,
      ]}>
      <Ionicons name={icon} size={size} color={color} />
      {badge ? (
        <View style={styles.badge} testID={testID ? `${testID}-badge` : undefined}>
          <Text variant="micro" color={colors.onAccent} style={styles.badgeText}>
            {badge > 9 ? "9+" : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filled: {
    backgroundColor: colors.primary,
  },
  pressed: {
    transform: [{ scale: motion.pressScale }],
    opacity: 0.9,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: radii.full,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    letterSpacing: 0,
    lineHeight: 13,
  },
});
