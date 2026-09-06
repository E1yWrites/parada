import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radii, shadows, spacing } from "@/src/theme";

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  accent?: string;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Soft light surface card with an optional playful top accent capsule.
 * Optional press affordance for tappable rows/cards.
 */
export function Card({ children, onPress, accent, padding = spacing.xl, style, testID }: CardProps) {
  const containerStyle = [styles.base, { padding }, style];
  const body = (
    <>
      {accent ? <View testID={testID ? `${testID}-accent` : undefined} style={[styles.accent, { backgroundColor: accent }]} /> : null}
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
  accent: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
});