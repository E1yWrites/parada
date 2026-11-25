import { useEffect, useMemo, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { Text } from "./Text";
import { fontSizes, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

type CapacityBarProps = {
  /** Occupied count as reported by the backend (authoritative). */
  occupied: number;
  /** Zone capacity as reported by the backend. */
  capacity: number;
  /** Fill color derived by the caller from an existing status token. */
  color?: string;
  /** Spaces held by window-valid reservations (capacity − occupied − available), drawn after the parked fill. */
  held?: number;
  /** Hide the label row when the numbers are already shown beside the bar. */
  compact?: boolean;
  testID?: string;
};

/**
 * Presentational occupancy indicator. Renders the actual occupancy text
 * (never color alone) plus a width-0..100% fill bar on a designed ghost
 * track, so remaining capacity is drawn as deliberately as the used part.
 * Accepts backend numbers verbatim; the visual width is clamped but the
 * numbers are never altered.
 */
export function CapacityBar({ occupied, capacity, color, held = 0, compact = false, testID }: CapacityBarProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const fillColor = color ?? colors.primary;
  const hasCapacity = Number.isFinite(capacity) && capacity > 0;
  const raw = hasCapacity ? occupied / capacity : 0;
  const percent = Math.round(Math.min(Math.max(raw, 0), 1) * 100);
  const width = `${percent}%` as const;
  const heldShown = hasCapacity ? Math.max(0, Math.min(held, capacity - occupied)) : 0;
  const heldWidth = `${Math.round((heldShown / Math.max(capacity, 1)) * 100)}%` as const;
  const label = !hasCapacity
    ? "No capacity data"
    : heldShown > 0
      ? `${occupied} parked · ${heldShown} held of ${capacity}`
      : `${occupied} of ${capacity} · ${percent}%`;
  const reducedMotion = usePrefersReducedMotion();
  const [grow] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  useEffect(() => {
    if (reducedMotion) {
      grow.setValue(1);
      return;
    }
    Animated.timing(grow, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [grow, reducedMotion]);

  return (
    <View style={styles.container} testID={testID}>
      {compact ? null : (
        <View style={styles.labelRow}>
          <Text variant="micro">OCCUPANCY</Text>
          <Text
            variant="mono"
            color={colors.muted}
            testID={testID ? `${testID}-percent` : undefined}
            style={styles.value}>
            {label}
          </Text>
        </View>
      )}
      <View
        style={styles.track}
        testID={testID ? `${testID}-track` : undefined}
        accessibilityLabel={compact ? label : undefined}>
        <Animated.View style={[styles.segments, { transform: [{ scaleX: grow }] }]}>
          <View
            testID={testID ? `${testID}-fill` : undefined}
            style={[styles.fill, { width, backgroundColor: hasCapacity ? fillColor : colors.border }]}
          />
          {heldShown > 0 ? (
            <View testID={testID ? `${testID}-held` : undefined} style={[styles.fill, { width: heldWidth, backgroundColor: colors.info }]} />
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    value: {
      flexShrink: 1,
      textAlign: "right",
      fontSize: fontSizes.micro,
    },
    track: {
      height: 8,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    segments: {
      flexDirection: "row",
      height: "100%",
      gap: 2,
      transformOrigin: "left",
    },
    fill: {
      height: "100%",
      borderRadius: radii.full,
    },
  });
}
