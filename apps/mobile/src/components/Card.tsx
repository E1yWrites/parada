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
 * Dark-matter surface card. Optional left accent bar, deep shadow, and
 * press affordance for tappable rows/cards.
 */
export function Card({ children, onPress, accent, padding = spacing.xl, style, testID }: CardProps) {
  const containerStyle = [
    styles.base,
    { padding },
    accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined,
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [containerStyle, pressed ? styles.pressed : undefined]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={containerStyle}>
      {children}
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
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});