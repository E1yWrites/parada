import type { ReactNode } from "react";
import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The hero surface: real frost (BlurView) over the WaveGrid ground, a tint
 * overlay and a specular top edge. Same shape/contract as
 * `Card`; reserved for the current-state pass, summaries and hero banners.
 * Falls back to a solid surface under the OS Reduce Transparency setting.
 */
export function GlassCard({ children, onPress, accent, padding = spacing.xl2, style, testID }: GlassCardProps) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const glass = useThemeGlass();
  const styles = useMemo(() => buildStyles(shadows), [shadows]);
  const reducedTransparency = usePrefersReducedTransparency();
  const preset = glass.hero;

  // ponytail: Android BlurView only blurs a registered BlurTargetView, which
  // the screens don't provide yet, so Android gets an opaque surface (a translucent one shows the elevation shadow through it) instead
  // of an unverified blur. Wire BlurTargetView + `blurTarget` to upgrade.
  const background = reducedTransparency ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.fallbackColor }]} />
  ) : Platform.OS === "android" ? (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.fallbackColor }]} />
      <View style={[styles.specular, { backgroundColor: preset.borderColor }]} />
    </>
  ) : (
    <>
      <BlurView
        testID={testID ? `${testID}-blur` : undefined}
        style={StyleSheet.absoluteFill}
        tint={preset.tint}
        intensity={preset.intensity}
        experimentalBlurMethod={blurMethod}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlayColor }]} />
      {/* Specular top edge: the light catching the glass. */}
      <View style={[styles.specular, { backgroundColor: preset.borderColor }]} />
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
      ...shadows.card,
    },
    clip: {
      borderRadius: radii.xl,
      borderWidth: 1,
      overflow: "hidden",
    },
    specular: {
      position: "absolute",
      top: 0,
      left: 18,
      right: 18,
      height: 1,
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
