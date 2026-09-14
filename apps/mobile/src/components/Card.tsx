import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, motion, radii, shadows, spacing } from "@/src/theme";

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  /** Optional stamp mark in a status color, drawn above the content. */
  accent?: string;
  padding?: number;
  /** `tinted` sits on the blue-tinted raised surface without a shadow (nested content). */
  tone?: "surface" | "tinted";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Soft white surface card with an optional stamp mark. Optional press
 * affordance for tappable rows/cards.
 */
export function Card({
  children,
  onPress,
  accent,
  padding = spacing.xl,
  tone = "surface",
  style,
  testID,
}: CardProps) {
  const containerStyle = [styles.base, tone === "tinted" ? styles.tinted : undefined, { padding }, style];
  const body = (
    <>
      {accent ? (
        <View
          testID={testID ? `${testID}-accent` : undefined}
          style={[styles.accent, { backgroundColor: accent }]}
        />
      ) : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [containerStyle, pressed ? styles.pressed : undefined]}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={containerStyle}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  tinted: {
    backgroundColor: colors.surfaceElevated,
    borderColor: "transparent",
    ...shadows.none,
  },
  accent: {
    width: 28,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: motion.pressScale }],
  },
});
