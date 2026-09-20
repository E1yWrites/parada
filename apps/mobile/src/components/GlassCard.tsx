import type { ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { blurMethod, motion, radii, spacing } from "@/src/theme";
import { useColors, useThemeGlass, useThemeShadows } from "@/src/providers/ThemeProvider";
import type { ShadowTokens } from "@/src/theme/shadows";
import { usePrefersReducedTransparency } from "@/src/hooks/usePrefersReducedTransparency";

type GlassCardProps = {
  children: ReactNode;
  onPress?: () => void;
  accent?: string;
  padding?: number;
  /** Wash color painted behind the frost (defaults to brand orange). */
  wash?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The pass / hero surface: a frost over a soft color wash, so the card reads
 * as a subtle gradient rather than flat surface. Same shape/contract as
 * `Card`; reserved for the current-state pass, summaries and hero banners.
 * Falls back to a solid surface under the OS Reduce Transparency setting.
 */
export function GlassCard({ children, onPress, accent, padding = spacing.xl2, wash, style, testID }: GlassCardProps) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const glass = useThemeGlass();
  const styles = useMemo(() => buildStyles(shadows), [shadows]);
  const reducedTransparency = usePrefersReducedTransparency();
  const preset = glass.hero;
  const washColor = wash ?? colors.primary;

  const background = reducedTransparency ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.fallbackColor }]} />
  ) : (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      <View style={[styles.wash, styles.washTop, { backgroundColor: washColor }]} />
      <View style={[styles.wash, styles.washBottom, { backgroundColor: washColor }]} />
      <BlurView
        testID={testID ? `${testID}-blur` : undefined}
        style={StyleSheet.absoluteFill}
        tint={preset.tint}
        intensity={preset.intensity}
        experimentalBlurMethod={blurMethod}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlayColor }]} />
    </>
  );

  const content = (
    // `style` lands here (not on `outer`) because this is the node that
    // actually holds `{accent}{children}` — layout props like `gap` from a
    // caller's style need to apply where the children are.
    <View testID={testID ? `${testID}-content` : undefined} style={[{ padding }, style]}>
      {accent ? (
        <View testID={testID ? `${testID}-accent` : undefined} style={[styles.accent, { backgroundColor: accent }]} />
      ) : null}
      {children}
    </View>
  );

  // Shadow lives on the outer, un-clipped view; the inner view clips the
  // wash/blur/border to the rounded corners.
  const clipStyle = [
    styles.clip,
    { borderColor: reducedTransparency ? colors.border : preset.borderColor },
  ];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.outer, pressed ? styles.pressed : undefined]}>
        <View style={clipStyle}>
          {background}
          {content}
        </View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={styles.outer}>
      <View style={clipStyle}>
        {background}
        {content}
      </View>
    </View>
  );
}

function buildStyles(shadows: ShadowTokens) {
  return StyleSheet.create({
    outer: {
      borderRadius: radii.xl,
      borderTopRightRadius: radii.cut + 4,
      ...shadows.card,
    },
    clip: {
      borderRadius: radii.xl,
      borderTopRightRadius: radii.cut + 4,
      borderWidth: 1,
      overflow: "hidden",
    },
    wash: {
      position: "absolute",
      width: 260,
      height: 260,
      borderRadius: 130,
      opacity: 0.16,
    },
    washTop: {
      top: -140,
      right: -80,
    },
    washBottom: {
      bottom: -180,
      left: -60,
      opacity: 0.08,
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
}
