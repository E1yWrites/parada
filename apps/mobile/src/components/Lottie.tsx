import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { motion } from "@/src/theme/motion";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";

// Lottie, PARADA's mascot. Four poses cut from the owner's sheet on one shared
// canvas (aligned on the cap), so swapping frames never shifts the figure.
const FRAMES = {
  calm: require("../../assets/lottie/lottie-calm.webp"),
  blink: require("../../assets/lottie/lottie-blink.webp"),
  ears: require("../../assets/lottie/lottie-ears.webp"),
  excited: require("../../assets/lottie/lottie-excited.webp"),
} as const;

export type LottieFrame = keyof typeof FRAMES;
const FRAME_NAMES = Object.keys(FRAMES) as LottieFrame[];

/** Source canvas is 319 × 312. */
const ASPECT = 312 / 319;
export const BLINK_EVERY_MS = 4200;
export const BLINK_FOR_MS = 140;
/** Tap: ears up, then excited, then back to calm. */
export const TAP_SEQUENCE: readonly { frame: LottieFrame; ms: number }[] = [
  { frame: "ears", ms: 320 },
  { frame: "excited", ms: 900 },
];
const FLOAT_DURATION_MS = 2400;
const FLOAT_DISTANCE = 4;

type LottieProps = {
  size?: number;
  /** Tapping plays a short happy reaction. Touch only; she is hidden from screen readers. */
  interactive?: boolean;
  testID?: string;
};

/**
 * Only on the welcome/login screens and the idle Now card. Decorative: any
 * greeting that names her is plain text beside her. Under Reduce Motion she
 * stays still — no rise-in, float or blink — though a tap still changes pose.
 */
export function Lottie({ size = 120, interactive = false, testID }: LottieProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [frame, setFrame] = useState<LottieFrame>("calm");
  const reacting = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rise = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      rise.setValue(1);
      return;
    }
    Animated.spring(rise, {
      toValue: 1,
      friction: motion.spring.friction,
      tension: motion.spring.tension,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, rise]);

  useEffect(() => {
    if (reducedMotion) {
      float.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: FLOAT_DURATION_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: FLOAT_DURATION_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    let open: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      if (reacting.current) return;
      setFrame("blink");
      open = setTimeout(() => setFrame((f) => (f === "blink" ? "calm" : f)), BLINK_FOR_MS);
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(interval);
      if (open) clearTimeout(open);
    };
  }, [reducedMotion]);

  function react() {
    if (reacting.current) return;
    reacting.current = true;
    let at = 0;
    for (const step of TAP_SEQUENCE) {
      timers.current.push(setTimeout(() => setFrame(step.frame), at));
      at += step.ms;
    }
    timers.current.push(
      setTimeout(() => {
        setFrame("calm");
        reacting.current = false;
      }, at),
    );
  }

  const height = Math.round(size * ASPECT);
  const translateY = Animated.add(
    rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
    float.interpolate({ inputRange: [0, 1], outputRange: [0, -FLOAT_DISTANCE] }),
  );

  // Every frame stays mounted and only the current one is visible, so a
  // swap never waits on an image decode (no flicker mid-blink). Each frame
  // gets an explicit size: stretched by absolute insets alone, the images
  // drew at their natural 319 pt on device and spilled over the text.
  const figure = (
    <Animated.View style={[styles.figure, { width: size, height, opacity: rise, transform: [{ translateY }] }]}>
      {FRAME_NAMES.map((name) => (
        <Image
          key={name}
          source={FRAMES[name]}
          resizeMode="contain"
          style={[styles.frameImage, { width: size, height, opacity: name === frame ? 1 : 0 }]}
          testID={testID ? `${testID}-${name}` : undefined}
        />
      ))}
    </Animated.View>
  );

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}>
      {interactive ? (
        <Pressable accessible={false} onPress={react} hitSlop={8} testID={testID ? `${testID}-tap` : undefined}>
          {figure}
        </Pressable>
      ) : (
        figure
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Clip as a second guard: nothing drawn outside Lottie's own box.
  figure: {
    overflow: "hidden",
  },
  frameImage: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
