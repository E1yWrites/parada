import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { GlassCard } from "./GlassCard";
import { Text } from "./Text";
import { StatusBadge } from "./StatusBadge";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { colors, radii, spacing } from "@/src/theme";
import { formatElapsed } from "@/lib/format";
import type { SessionDto } from "@/lib/api/client";

type ActiveSessionBannerProps = {
  session: SessionDto;
  now?: Date;
  testID?: string;
};

/** Full-width "your vehicle is parked" banner with a live elapsed clock. */
export function ActiveSessionBanner({ session, now, testID }: ActiveSessionBannerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <GlassCard accent={colors.primary} style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.dotWrap}>
          <Animated.View
            testID={testID ? `${testID}-glow` : undefined}
            style={[styles.glow, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] }) }]}
          />
          <View style={styles.dot} />
        </View>
        <StatusBadge
          meta={{ label: "Parked", icon: "car", color: colors.primary }}
          testID={testID ? `${testID}-badge` : undefined}
        />
      </View>
      <View style={styles.content}>
        <Text variant="micro">YOUR VEHICLE IS PARKED IN</Text>
        <Text variant="hero" numberOfLines={2} testID={testID ? `${testID}-zone` : undefined}>
          {session.zone.name}
        </Text>
        <Text variant="plate" numberOfLines={1} testID={testID ? `${testID}-plate` : undefined}>
          {session.vehicle?.plateNumber ?? "GUEST"}
        </Text>
        <View style={styles.elapsedRow}>
          <Text variant="caption" color={colors.muted}>
            SESSION ELAPSED
          </Text>
          <Text variant="display" color={colors.highlight} testID={testID ? `${testID}-elapsed` : undefined}>
            {formatElapsed(session.enteredAt, now)}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl2,
    borderRadius: radii.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  dotWrap: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  content: {
    gap: spacing.md,
  },
  elapsedRow: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});