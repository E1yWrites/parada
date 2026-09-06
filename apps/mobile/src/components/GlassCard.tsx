import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { blurMethod, colors, glass, radii, shadows, spacing } from "@/src/theme";
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
 * Frosted-glass hero surface — the same shape/contract as `Card`, but with a
 * blurred translucent background instead of a solid one. Reserved for hero
 * banners and summary cards; regular content keeps using `Card`. Falls back
 * to a solid surface under the OS Reduce Transparency setting.
 */
export function GlassCard({ children, onPress, accent, padding = spacing.xl, style, testID }: GlassCardProps) {
  const reducedTransparency = usePrefersReducedTransparency();
  const preset = glass.hero;

  const background = reducedTransparency ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.fallbackColor }]} />
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
    </>
  );

  const content = (
    // `style` lands here (not on `outer`) because this is the node that
    // actually holds `{accent}{children}` — layout props like `gap` from a
    // caller's style need to apply where the children are. Note: a
    // caller-supplied `borderRadius` in `style` won't resize `outer`/`clip`
    // below, which stay fixed at `radii.lg` — an accepted limitation of this
    // two-layer (shadow-outer + clipped-inner) structure.
    <View testID={testID ? `${testID}-content` : undefined} style={[{ padding }, style]}>
      {accent ? (
        <View testID={testID ? `${testID}-accent` : undefined} style={[styles.accent, { backgroundColor: accent }]} />
      ) : null}
      {children}
    </View>
  );

  // Shadow lives on the outer, un-clipped view; the inner view clips the
  // blur/border to the rounded corners (overflow:hidden would also clip an
  // iOS shadow if applied on the same node).
  const outerStyle = styles.outer;
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
        style={({ pressed }) => [outerStyle, pressed ? styles.pressed : undefined]}>
        <View style={clipStyle}>
          {background}
          {content}
        </View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={outerStyle}>
      <View style={clipStyle}>
        {background}
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: radii.lg,
    ...shadows.card,
  },
  clip: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
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
