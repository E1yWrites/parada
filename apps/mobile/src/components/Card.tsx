import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { motion, radii, spacing } from "@/src/theme";
import { useColors, useThemeShadows } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import type { ShadowTokens } from "@/src/theme/shadows";

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  /** Optional stamp mark in a status color, drawn above the content. */
  accent?: string;
  padding?: number;
  /** `tinted` sits on the raised surface without a shadow (nested content). */
  tone?: "surface" | "tinted";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The PARADA surface: one soft corner set, one sharp cut corner (top-right)
 * — the shared "gate control" shape, never a plain uniform rounded
 * rectangle. Optional stamp mark; optional press affordance for tappable
 * rows/cards.
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
  const colors = useColors();
  const shadows = useThemeShadows();
  const styles = useMemo(() => buildStyles(colors, shadows), [colors, shadows]);
  const containerStyle = [styles.base, tone === "tinted" ? styles.tinted : undefined, { padding }, style];
  const scale = useRef(new Animated.Value(1)).current;
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
        onPressIn={() => {
          Animated.spring(scale, { toValue: 0.96, friction: 7, tension: 300, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          Animated.spring(scale, {
            toValue: 1,
            friction: motion.springPlayful.friction,
            tension: motion.springPlayful.tension,
            useNativeDriver: true,
          }).start();
        }}>
        <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>{body}</Animated.View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={containerStyle}>
      {body}
    </View>
  );
}

function buildStyles(colors: ColorTokens, shadows: ShadowTokens) {
  return StyleSheet.create({
    base: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderTopRightRadius: radii.cut,
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
  });
}
