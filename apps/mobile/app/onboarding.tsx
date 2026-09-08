import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Button, Screen, Text } from "@/src/components";
import { colors, radii, spacing } from "@/src/theme";

type Slide = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: "grid",
    title: "See what's open before you drive in.",
    body: "Live zone-level availability from gate cameras — no guessing, no circling the lot.",
  },
  {
    icon: "time",
    title: "Hold your spot.",
    body: "Reserve a zone for your arrival window so it's still there when you pull up.",
  },
  {
    icon: "shield-checkmark",
    title: "Park in your assigned zone.",
    body: "Your plate is your ID. Park outside your zone and you'll get a warning before any fine.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index]!;
  const last = index === SLIDES.length - 1;

  function next() {
    if (last) {
      router.replace("/login");
      return;
    }
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }

  return (
    <Screen scroll={false} testID="onboarding-screen">
      {!last ? (
        <Button
          variant="ghost"
          title="Skip"
          onPress={() => router.replace("/login")}
          accessibilityLabel="Skip onboarding"
          testID="onboarding-skip"
        />
      ) : null}
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={slide.icon} size={44} color={colors.primary} />
        </View>
        <Text variant="hero" align="center" testID="onboarding-title">
          {slide.title}
        </Text>
        <Text variant="body" align="center" color={colors.muted}>
          {slide.body}
        </Text>
      </View>
      <View style={styles.footer}>
        <View style={styles.dots} testID="onboarding-dots">
          {SLIDES.map((_, i) => (
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

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl2,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    gap: spacing.xl2,
    paddingBottom: spacing.xl,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.primary,
  },
});
