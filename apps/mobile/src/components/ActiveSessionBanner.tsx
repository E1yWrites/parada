import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";
import { PlateChip } from "./PlateChip";
import { Stamp } from "./Stamp";
import { Text } from "./Text";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { colors, motion, radii, spacing } from "@/src/theme";
import { formatElapsed } from "@/lib/format";
import type { SessionDto } from "@/lib/api/client";

type ActiveSessionBannerProps = {
  session: SessionDto;
  now?: Date;
  /** Extra pass content (session facts, the primary Navigate action). */
  children?: ReactNode;
  testID?: string;
};

/**
 * The parked pass: full-width hero card stating that the vehicle is inside,
 * with the zone at hero size, the plate as a chip and a live elapsed clock.
 * The stamp lands with a short spring when the card mounts; the live dot
 * pulses. Both are skipped under Reduce Motion.
 */
export function ActiveSessionBanner({ session, now, children, testID }: ActiveSessionBannerProps) {
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
          duration: motion.duration.slow,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: motion.duration.slow,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <GlassCard style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.liveRow}>
          <View style={styles.dotWrap}>
            <Animated.View
              testID={testID ? `${testID}-glow` : undefined}
              style={[
                styles.glow,
                { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.7] }) },
              ]}
            />
            <View style={styles.dot} />
          </View>
          <Stamp label="Parked" icon="car" color={colors.primary} testID={testID ? `${testID}-badge` : undefined} />
        </View>
        <PlateChip value={session.zone.code} tone="soft" size="sm" />
      </View>

      <View style={styles.content}>
        <Text variant="hero" numberOfLines={2} testID={testID ? `${testID}-zone` : undefined}>
          {session.zone.name}
        </Text>
        <Text variant="plate" numberOfLines={1} testID={testID ? `${testID}-plate` : undefined}>
          {session.vehicle?.plateNumber ?? "GUEST"}
        </Text>
      </View>

      <View style={styles.elapsedRow}>
        <View style={styles.elapsedIcon}>
          <Ionicons name="time" size={18} color={colors.primary} />
        </View>
        <View style={styles.elapsedText}>
          <Text variant="micro">SESSION ELAPSED</Text>
          <Text variant="display" testID={testID ? `${testID}-elapsed` : undefined}>
            {formatElapsed(session.enteredAt, now)}
          </Text>
        </View>
      </View>
      {children}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexShrink: 1,
  },
  dotWrap: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  content: {
    gap: spacing.lg,
  },
  elapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  elapsedIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  elapsedText: {
    flex: 1,
    gap: spacing.xs,
  },
});
