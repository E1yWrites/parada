import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { motion } from "@/src/theme/motion";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { useColors, useThemeShadows } from "@/src/providers/ThemeProvider";

/** One idle-float cycle (up, then back down). Slow and small — a hover, not a bounce. */
const FLOAT_DURATION_MS = 2200;
const FLOAT_DISTANCE = 7;

// The canonical PARADA mascot assets — fixed images, never redrawn,
// recolored, or distorted. `resizeMode="contain"` only; each source's own
// proportions are always preserved. "body" is the full-figure shot (empty
// states, larger scenes); the rest are head-only close crops sized for
// small header/greeting moments, each already posed for its context.
const MASCOT_ASSETS = {
  body: require("../../assets/mascot/parada-mascot.webp"),
  home: require("../../assets/mascot/head_home.png"),
  park: require("../../assets/mascot/head_park.png"),
  history: require("../../assets/mascot/head_history.png"),
  notifications: require("../../assets/mascot/head_notifications.png"),
} as const;

export type MascotVariant = keyof typeof MASCOT_ASSETS;

type MascotProps = {
  /** Which canonical image to render. Defaults to the full-figure body shot. */
  variant?: MascotVariant;
  /** Small context badge naming the situation (e.g. "offline", "no vehicles yet"). */
  accentIcon?: ComponentProps<typeof Ionicons>["name"];
  accentColor?: string;
  size?: number;
  testID?: string;
};

/**
 * PARADA's mascot, used selectively at empty/first-time/confirmation
 * moments — never behind content, never competing with the zone selector.
 * Renders on its own transparent ground (no tinted disc behind it) so the
 * character itself stays the whole focus; only its entrance (a short
 * bounce-in, skipped under Reduce Motion) and the optional corner badge
 * change per context.
 */
export function Mascot({ variant = "body", accentIcon, accentColor, size = 120, testID }: MascotProps) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const reducedMotion = usePrefersReducedMotion();
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.85)).current;
  const float = useRef(new Animated.Value(0)).current;
  const tint = accentColor ?? colors.primary;

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      friction: motion.springPlayful.friction,
      tension: motion.springPlayful.tension,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, scale]);

  useEffect(() => {
    if (reducedMotion) {
      float.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: FLOAT_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: FLOAT_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, reducedMotion]);

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -FLOAT_DISTANCE] });
  // The ground shadow can't share the image's transform (it must stay put
  // while the character rises), so it gets its own inverse read of the same
  // driver: as the mascot lifts, its shadow shrinks and fades — the
  // classic "floating object" cue.
  const shadowScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  const shadowOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.1] });

  const shadowWidth = size * 0.52;
  const shadowHeight = size * 0.13;

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.groundShadow,
          {
            width: shadowWidth,
            height: shadowHeight,
            borderRadius: shadowHeight,
            left: (size - shadowWidth) / 2,
            bottom: size * 0.04,
            opacity: shadowOpacity,
            transform: [{ scale: shadowScale }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }, { translateY: floatY }] }}>
        <Image source={MASCOT_ASSETS[variant]} resizeMode="contain" style={{ width: size, height: size }} />
      </Animated.View>
      {accentIcon ? (
        <View
          style={[
            styles.badge,
            {
              width: Math.round(size * 0.32),
              height: Math.round(size * 0.32),
              borderRadius: Math.round(size * 0.16),
              borderTopRightRadius: 3,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
            shadows.card,
          ]}>
          <Ionicons name={accentIcon} size={Math.round(size * 0.16)} color={tint} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
  groundShadow: {
    position: "absolute",
    backgroundColor: "#000000",
  },
  badge: {
    position: "absolute",
    right: "4%",
    bottom: "2%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
