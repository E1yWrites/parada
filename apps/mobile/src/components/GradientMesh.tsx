import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { useColors, useColorSchemeResolved } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { motion } from "@/src/theme/motion";
import type { ColorTokens } from "@/src/theme/colors";

type Blob = {
  color: string;
  size: number;
  opacity: number;
  /** Vertical anchor as a fraction of the WINDOW height (see below). */
  topFraction: number;
  /** Pixel offset applied after the fraction. */
  topOffset: number;
  left?: number;
  right?: number;
  /** Ambient drift target, applied as a transform on top of the static anchor. */
  driftX: number;
  driftY: number;
};

/**
 * Two off-screen-anchored washes give the ground a subtle gradient and give
 * frosted surfaces something to blur. Most of each circle falls outside the
 * frame — the visible slice reads as ambient color, never a shape. Dark mode
 * keeps the wash very faint (an asphalt ground reads best near-flat); light
 * mode leans on the same hues slightly stronger since the warm paper ground
 * has less inherent depth to lose.
 *
 * Both blobs are anchored from the TOP using the window height, never with
 * `bottom`. The parent view shrinks whenever the software keyboard opens or
 * changes height (Android adjustResize, iOS inset changes, the QuickType /
 * password bar toggling while typing), and a bottom-anchored wash would slide
 * up with every keystroke — the whole screen appeared to "fade upward" on
 * the auth forms. Window-based anchoring keeps the ambient layer still.
 */
function buildBlobs(colors: ColorTokens, dark: boolean): Blob[] {
  const base = dark ? 0.09 : 0.07;
  return [
    {
      color: colors.primary,
      size: 460,
      opacity: base,
      topFraction: 0,
      topOffset: -220,
      right: -160,
      driftX: -34,
      driftY: 28,
    },
    {
      color: colors.success,
      size: 380,
      opacity: base * 0.7,
      topFraction: 1,
      topOffset: -180,
      left: -150,
      driftX: 30,
      driftY: -26,
    },
  ];
}

/**
 * Ambient background layer behind `Screen` content. Each blob is two
 * concentric translucent circles — a cheap stand-in for a radial gradient,
 * since React Native has no native radial-gradient primitive — so the
 * visible edge fades rather than cutting off hard.
 */
/**
 * Ambient drift + breathe: a slow (ambient-duration per leg) back-and-forth
 * loop, not a one-shot moment, so it is driven directly rather than through
 * `motion.spring`/`motion.duration.base`. Static under Reduce Motion — the
 * progress value simply never leaves 0, which is each blob's resting state.
 */
function useAmbientProgress(reducedMotion: boolean): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: motion.duration.ambient,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: motion.duration.ambient,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reducedMotion]);
  return progress;
}

export function GradientMesh({ testID }: { testID?: string }) {
  const { height } = useWindowDimensions();
  const colors = useColors();
  const scheme = useColorSchemeResolved();
  const reducedMotion = usePrefersReducedMotion();
  const blobs = useMemo(() => buildBlobs(colors, scheme === "dark"), [colors, scheme]);
  const progress = useAmbientProgress(reducedMotion);
  return (
    <View testID={testID} style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      {blobs.map((blob, index) => (
        <Animated.View
          key={index}
          style={[
            styles.blob,
            {
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              backgroundColor: blob.color,
              top: Math.round(height * blob.topFraction) + blob.topOffset,
              left: blob.left,
              right: blob.right,
            },
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [blob.opacity, blob.opacity * 1.7],
              }),
              transform: [
                {
                  translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, blob.driftX] }),
                },
                {
                  translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, blob.driftY] }),
                },
              ],
            },
          ]}>
          <View
            style={[
              styles.core,
              {
                borderRadius: blob.size * 0.35,
                backgroundColor: blob.color,
              },
            ]}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    width: "60%",
    height: "60%",
    opacity: 0.4,
  },
});
