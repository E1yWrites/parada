import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { motion, radii, spacing, withAlpha } from "@/src/theme";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { useColorSchemeResolved, useColors, useThemeShadows } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import type { ShadowTokens } from "@/src/theme/shadows";
import { pulseWaves } from "./WaveGrid";

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
 * The Clear surface: a translucent frosted row (82% surface over the wave
 * ground, bright hairline edge, soft long shadow). No per-card blur — there
 * are dozens of these on screen and Android blur is costly; hero cards,
 * sheets and pop-ups use `GlassCard` for real blur. Optional stamp mark;
 * optional press affordance for tappable rows/cards.
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
  const scheme = useColorSchemeResolved();
  const styles = useMemo(() => buildStyles(colors, shadows, scheme === "dark"), [colors, shadows, scheme]);
  const outerStyle = [
    styles.outer,
    tone === "tinted" ? styles.outerTinted : undefined,
    shadowColor != null ? { shadowColor } : undefined,
    shadowOpacity != null ? { shadowOpacity } : undefined,
  ];
  const [scale] = useState(() => new Animated.Value(1));
  const reducedMotion = usePrefersReducedMotion();
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
          if (reducedMotion) {
            return;
          }
          pulseWaves(0.7);
          Animated.spring(scale, { toValue: 0.96, friction: 7, tension: 300, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          if (reducedMotion) {
            return;
          }
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

function buildStyles(colors: ColorTokens, shadows: ShadowTokens, dark: boolean) {
  return StyleSheet.create({
    outer: {
      borderRadius: radii.lg,
      ...shadows.card,
    },
    outerTinted: {
      ...shadows.none,
    },
    clip: {
      // Android draws the elevation shadow through a translucent fill (a grey
      // ghost box inside the card), so Android cards stay opaque.
      backgroundColor: Platform.OS === "android" ? colors.surface : withAlpha(colors.surface, 0.82),
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: dark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.85)",
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
