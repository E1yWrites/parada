import { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, GlassCard, Lottie, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { markOnboardingCompleted } from "@/lib/onboarding";
import { motion, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

const SLIDES = [
  {
    greeting: "Hi, I'm Lottie.",
    title: "See what's open before you drive in.",
    body: "Zone availability counted from gate-camera entries and exits — no guessing, no circling the lot.",
  },
  {
    title: "Hold your spot.",
    body: "Reserve a zone for your arrival window so it's still there when you pull up.",
  },
  {
    title: "Park in your assigned zone.",
    body: "Your plate is your ID. Park outside your zone and you'll get a warning before any fine.",
  },
] as const;

/** Pin positions on the stage (fractions of its width) for slide 1. */
const PINS = [
  { x: 0.18, y: 70 },
  { x: 0.5, y: 20 },
  { x: 0.8, y: 92 },
] as const;

/**
 * Onboarding as one stage carried across three beats instead of three
 * separate cards: zone pins stand on the wave grid → the middle pin rises
 * into a reservation hold → that hold becomes the plate-to-zone pass with a
 * wrong-zone warning chip. Copy changes in step. Under Reduce Motion the
 * stage jumps between beats.
 */
export default function OnboardingScreen() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [stageWidth, setStageWidth] = useState(340);
  const [stage] = useState(() => new Animated.Value(0));
  const [copyIn] = useState(() => new Animated.Value(1));
  const slide = SLIDES[index as 0 | 1 | 2];
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    if (reducedMotion) {
      stage.setValue(index);
      copyIn.setValue(1);
      return;
    }
    Animated.spring(stage, { toValue: index, friction: 9, tension: 45, useNativeDriver: true }).start();
    copyIn.setValue(0);
    Animated.timing(copyIn, { toValue: 1, duration: motion.duration.base * 2, easing: motion.easing.out, useNativeDriver: true }).start();
  }, [copyIn, index, reducedMotion, stage]);

  // Finishing or skipping records completion for this installation, so the
  // next launch goes straight to login.
  function finish() {
    void markOnboardingCompleted().finally(() => router.replace("/login"));
  }

  function next() {
    if (last) {
      finish();
      return;
    }
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }

  const at = (inputRange: number[], outputRange: number[]) =>
    stage.interpolate({ inputRange, outputRange, extrapolate: "clamp" });

  return (
    <Screen scroll={false} ground="vivid" scrimFrom={0.66} testID="onboarding-screen">
      <View style={styles.topRow}>
        <BrandMark size={30} />
        {!last ? (
          <Button variant="ghost" size="sm" title="Skip" onPress={finish} accessibilityLabel="Skip onboarding" testID="onboarding-skip" />
        ) : null}
      </View>

      <View style={styles.stage} onLayout={(e) => setStageWidth(e.nativeEvent.layout.width)}>
        {/* Beat 1: Lottie greets — slide 1 only (the mascot's agreed placements). */}
        {index === 0 ? (
          <Animated.View style={[styles.lottie, { opacity: at([0, 0.6], [1, 0]) }]}>
            <Lottie size={132} interactive testID="onboarding-lottie" />
          </Animated.View>
        ) : null}

        {/* Zone pins on the grid; the middle one rises into the hold. */}
        {PINS.map((pin, i) => {
          const middle = i === 1;
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.pin,
                {
                  left: pin.x * stageWidth - 24,
                  top: 190 + pin.y,
                  opacity: middle ? at([0, 1, 1.6], [1, 1, 0]) : at([0, 0.7], [1, 0]),
                  transform: [
                    { translateY: middle ? at([0, 1], [0, -120]) : at([0, 1], [0, 30]) },
                    { scale: middle ? at([0, 1], [1, 1.15]) : at([0, 1], [1, 0.8]) },
                  ],
                },
              ]}>
              <View style={[styles.pinHead, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="location" size={20} color={colors.primaryDeep} />
              </View>
              <View style={[styles.pinStem, { backgroundColor: colors.primaryDeep }]} />
            </Animated.View>
          );
        })}

        {/* Beat 2 → 3: the hold card becomes the plate-to-zone pass. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.card, { opacity: at([0.4, 1], [0, 1]), transform: [{ translateY: at([0, 1, 2], [60, 0, -30]) }] }]}>
          <GlassCard padding={spacing.xl}>
            <Animated.View style={[styles.cardRow, { opacity: at([1, 1.5], [1, 0]) }]}>
              <View style={[styles.ring, { borderColor: colors.info }]} />
              <View style={styles.cardText}>
                <Text variant="bodySemi">Space held</Text>
                <Text variant="caption">Kept for your arrival window</Text>
              </View>
            </Animated.View>
            <Animated.View style={[styles.cardRow, styles.overlay, { opacity: at([1.5, 2], [0, 1]) }]}>
              <View style={[styles.carTile, { backgroundColor: colors.infoSoft }]}>
                <Ionicons name="car-sport" size={26} color={colors.infoInk} />
              </View>
              <View style={styles.cardText}>
                <Text variant="bodySemi">Your plate → your zone</Text>
                <Text variant="caption">Assigned · your plate is your ID</Text>
              </View>
            </Animated.View>
          </GlassCard>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.chip, { backgroundColor: colors.warningSoft, opacity: at([1.6, 2], [0, 1]), transform: [{ translateY: at([1.6, 2], [16, 0]) }] }]}>
          <Ionicons name="warning" size={15} color={colors.warningInk} />
          <Text variant="caption" color={colors.warningInk}>
            Wrong zone? A warning comes first.
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.copy, { opacity: copyIn, transform: [{ translateX: copyIn.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
        {"greeting" in slide ? (
          <Text variant="bodySemi" color={colors.primaryInk} testID="onboarding-greeting">
            {slide.greeting}
          </Text>
        ) : null}
        <Text variant="hero" testID="onboarding-title">
          {slide.title}
        </Text>
        <Text variant="body" color={colors.muted}>
          {slide.body}
        </Text>
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dots} testID="onboarding-dots" accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <Pressable
              key={i}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Go to step ${i + 1}`}
              onPress={() => setIndex(i)}
              style={[styles.dot, i === index ? styles.dotActive : undefined]}
            />
          ))}
        </View>
        <Button title={last ? "Get started" : "Next"} onPress={next} accessibilityLabel={last ? "Get started" : "Next"} testID="onboarding-next" />
      </View>
    </Screen>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
    stage: { flex: 1, minHeight: 320 },
    lottie: { alignItems: "center", marginTop: spacing.xl },
    pin: { position: "absolute", width: 48, alignItems: "center" },
    pinHead: { width: 44, height: 44, borderRadius: radii.full, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    pinStem: { width: 2, height: 22, opacity: 0.6 },
    card: { position: "absolute", left: 0, right: 0, top: 110 },
    cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
    overlay: { position: "absolute", left: spacing.xl, right: spacing.xl, top: spacing.xl },
    cardText: { flex: 1, minWidth: 0, gap: 2 },
    ring: { width: 48, height: 48, borderRadius: 24, borderWidth: 6, borderRightColor: "transparent" },
    carTile: { width: 48, height: 48, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
    chip: {
      position: "absolute",
      top: 230,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.full,
    },
    copy: { gap: spacing.md, minHeight: 150 },
    footer: { gap: spacing.xl2, paddingBottom: spacing.xl },
    dots: { flexDirection: "row", justifyContent: "center", gap: spacing.md },
    dot: { width: 8, height: 8, borderRadius: radii.full, backgroundColor: colors.borderStrong },
    dotActive: { width: 24, backgroundColor: colors.foreground },
  });
}
