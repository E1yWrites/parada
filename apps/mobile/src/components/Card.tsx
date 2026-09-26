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
  /** Recolors the theme card shadow (e.g. a selected-state glow); offset/blur stay fixed. */
  shadowColor?: string;
  shadowOpacity?: number;
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
  shadowColor,
  shadowOpacity,
  testID,
}: CardProps) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const styles = useMemo(() => buildStyles(colors, shadows), [colors, shadows]);
  const outerStyle = [
    styles.outer,
    tone === "tinted" ? styles.outerTinted : undefined,
    shadowColor != null ? { shadowColor } : undefined,
    shadowOpacity != null ? { shadowOpacity } : undefined,
  ];
  const scale = useRef(new Animated.Value(1)).current;
  const content = (
    // The border/background/radius clip lives on its own inner view, separate
    // from the shadow-casting outer one (no border, no background) — on
    // Android, an elevation shadow drawn on a view that also paints a border
    // renders as a hard rectangle instead of following the rounded corner, so
    // the two concerns can't share a view. `style` lands here (not on
    // `outer`) since this is the node that actually holds the children —
    // same split as GlassCard, and for the same reason.
    <View
      testID={testID ? `${testID}-content` : undefined}
      style={[styles.clip, tone === "tinted" ? styles.clipTinted : undefined, { padding }, style]}>
      {accent ? (
        <View
          testID={testID ? `${testID}-accent` : undefined}
          style={[styles.accent, { backgroundColor: accent }]}
        />
      ) : null}
      {children}
    </View>
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
        <Animated.View style={[outerStyle, { transform: [{ scale }] }]}>{content}</Animated.View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={outerStyle}>
      {content}
    </View>
  );
}

function buildStyles(colors: ColorTokens, shadows: ShadowTokens) {
  return StyleSheet.create({
    outer: {
      borderRadius: radii.lg,
      borderTopRightRadius: radii.cut,
      ...shadows.card,
    },
    outerTinted: {
      ...shadows.none,
    },
    clip: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderTopRightRadius: radii.cut,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    clipTinted: {
      backgroundColor: colors.surfaceElevated,
      borderColor: "transparent",
    },
    accent: {
      width: 28,
      height: 4,
      borderRadius: radii.full,
      marginBottom: spacing.lg,
    },
  });
}
