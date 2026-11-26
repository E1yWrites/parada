import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { Lottie } from "./Lottie";
import { Text } from "./Text";

type LottieGuideProps = {
  /** What she says, in order. Tapping her (or the bubble) moves to the next line. */
  lines: string[];
  size?: number;
  /** testID for Lottie herself (defaults to `${testID}-lottie`). */
  lottieTestID?: string;
  testID?: string;
};

/**
 * Lottie with a speech bubble. The lines come from the screen (live data such
 * as the least-busy zone), so she is useful, not just decoration. Lottie
 * herself stays hidden from screen readers; the bubble is a real button that
 * reads the current line and advances it.
 */
export function LottieGuide({ lines, size = 104, lottieTestID, testID }: LottieGuideProps) {
  const colors = useColors();
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [pop] = useState(() => new Animated.Value(1));
  const line = lines.length > 0 ? lines[index % lines.length]! : null;

  useEffect(() => {
    if (reducedMotion) return;
    pop.setValue(0.9);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [index, pop, reducedMotion]);

  const next = () => setIndex((i) => i + 1);
  return (
    <View style={styles.wrap} testID={testID}>
      <Lottie size={size} interactive onTap={next} testID={lottieTestID ?? (testID ? `${testID}-lottie` : undefined)} />
      {line ? (
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={line}
            accessibilityHint={lines.length > 1 ? "Shows Lottie's next tip" : undefined}
            onPress={next}
            style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID={testID ? `${testID}-bubble` : undefined}>
            <View style={[styles.tail, { backgroundColor: colors.surface, borderColor: colors.border }]} />
            <Text variant="bodySemi" align="center">
              {line}
            </Text>
            {lines.length > 1 ? (
              <Text variant="micro" align="center" color={colors.muted}>
                TAP FOR NEXT TIP · {(index % lines.length) + 1}/{lines.length}
              </Text>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.md },
  bubble: {
    minHeight: 44,
    maxWidth: 300,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 2,
  },
  tail: {
    position: "absolute",
    top: -7,
    alignSelf: "center",
    width: 14,
    height: 14,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    transform: [{ rotate: "45deg" }],
  },
});
