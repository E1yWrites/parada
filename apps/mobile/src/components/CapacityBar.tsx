import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radii, spacing } from "@/src/theme";

type CapacityBarProps = {
  /** Occupied count as reported by the backend (authoritative). */
  occupied: number;
  /** Zone capacity as reported by the backend. */
  capacity: number;
  /** Fill color derived by the caller from an existing status token. */
  color?: string;
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
export function CapacityBar({
  occupied,
  capacity,
  color = colors.primary,
  compact = false,
  testID,
}: CapacityBarProps) {
  const hasCapacity = Number.isFinite(capacity) && capacity > 0;
  const raw = hasCapacity ? occupied / capacity : 0;
  const percent = Math.round(Math.min(Math.max(raw, 0), 1) * 100);
  const width = `${percent}%` as const;
  const label = hasCapacity ? `${occupied} of ${capacity} · ${percent}%` : "No capacity data";

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
        <View
          testID={testID ? `${testID}-fill` : undefined}
          style={[styles.fill, { width, backgroundColor: hasCapacity ? color : colors.border }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 12,
  },
  track: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radii.full,
  },
});
