import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { Stamp } from "./Stamp";
import { Text } from "./Text";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { motion, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
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
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const reducedMotion = usePrefersReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));

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
    <Card padding={spacing.xl2} style={styles.card} testID={testID}>
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
          <Stamp label="Parked" icon="car" color={colors.primaryDeep} testID={testID ? `${testID}-badge` : undefined} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.rightGroup}>
          <Text variant="hero" numberOfLines={2} style={styles.elapsedText} testID={testID ? `${testID}-zone` : undefined}>
            {session.zone.name}
          </Text>
          <PlateChip value={session.zone.code} tone="soft" size="sm" />
        </View>
        <View style={styles.rightGroup}>
          <Ionicons name="car-outline" size={15} color={colors.muted} />
          <Text variant="caption" color={colors.foreground} numberOfLines={1} testID={testID ? `${testID}-plate` : undefined}>
            {session.vehicle?.plateNumber ?? "GUEST"}
          </Text>
        </View>
      </View>

      {/* The one number that changes while parked is the hero; no label box around it. */}
      <View style={styles.elapsedRow}>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit testID={testID ? `${testID}-elapsed` : undefined}>
          {formatElapsed(session.enteredAt, now)}
        </Text>
        <Text variant="caption">parked so far</Text>
      </View>
      {children}
    </Card>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
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
    rightGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
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
      borderRadius: radii.full,
      // The live pulse is the orange accent, not the ink button colour.
      backgroundColor: colors.primaryDeep,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radii.full,
      backgroundColor: colors.primaryDeep,
    },
    content: {
      gap: spacing.sm,
    },
    elapsedRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.md,
    },
    elapsedText: {
      flexShrink: 1,
    },
  });
}
