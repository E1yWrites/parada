import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, GlassCard, Illustration, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import type { IllustrationName } from "@/src/components/Illustration";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { markOnboardingCompleted } from "@/lib/onboarding";
import { motion, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

type Slide = {
  illustration: IllustrationName;
  wash: string;
  title: string;
  body: string;
};

function buildSlides(colors: ColorTokens): Slide[] {
  return [
    {
      illustration: "zones",
      wash: colors.primary,
      title: "See what's open before you drive in.",
      body: "Zone availability counted from gate-camera entries and exits — no guessing, no circling the lot.",
    },
    {
      illustration: "reserve",
      wash: colors.success,
      title: "Hold your spot.",
      body: "Reserve a zone for your arrival window so it's still there when you pull up.",
    },
    {
      illustration: "shield",
      wash: colors.warning,
      title: "Park in your assigned zone.",
      body: "Your plate is your ID. Park outside your zone and you'll get a warning before any fine.",
    },
  ];
}

export default function OnboardingScreen() {
  const colors = useColors();
  const slides = useMemo(() => buildSlides(colors), [colors]);
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const reveal = useRef(new Animated.Value(1)).current;
  const slide = slides[index]!;
  const last = index === slides.length - 1;

  // One authored moment: the hero card fades/slides in when the slide changes.
  useEffect(() => {
    if (reducedMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: motion.duration.base,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [index, reducedMotion, reveal]);

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
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  }

  return (
    <Screen scroll={false} testID="onboarding-screen">
      <View style={styles.topRow}>
        <BrandMark size={30} />
        {!last ? (
          <Button
            variant="ghost"
            size="sm"
            title="Skip"
            onPress={finish}
            accessibilityLabel="Skip onboarding"
            testID="onboarding-skip"
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <Animated.View
          style={{
            opacity: reveal,
            transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}>
          <GlassCard wash={slide.wash} style={styles.hero} padding={spacing.xl3}>
            <View style={styles.art}>
              <Illustration name={slide.illustration} size={168} />
            </View>
            <View style={styles.copy}>
              <Text variant="hero" testID="onboarding-title">
                {slide.title}
              </Text>
              <Text variant="body" color={colors.muted}>
                {slide.body}
              </Text>
            </View>
          </GlassCard>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots} testID="onboarding-dots" accessibilityLabel={`Step ${index + 1} of ${slides.length}`}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index ? styles.dotActive : undefined]} />
          ))}
        </View>
        <Button
          title={last ? "Get started" : "Next"}
          onPress={next}
          accessibilityLabel={last ? "Get started" : "Next"}
          testID="onboarding-next"
        />
      </View>
    </Screen>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 44,
    },
    body: {
      flex: 1,
      justifyContent: "center",
    },
    hero: {
      gap: spacing.xl3,
    },
    art: {
      alignItems: "center",
      paddingVertical: spacing.xl,
    },
    copy: {
      gap: spacing.lg,
    },
    footer: {
      gap: spacing.xl2,
      paddingBottom: spacing.xl,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.md,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radii.full,
      backgroundColor: colors.border,
    },
    dotActive: {
      width: 24,
      backgroundColor: colors.primary,
    },
  });
}
