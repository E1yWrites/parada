import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { CapacityBar } from "./CapacityBar";
import { AvailabilityBadge, parkingStatusMeta } from "./StatusBadge";
import { Metric } from "./Metric";
import { Text } from "./Text";
import { colors, spacing } from "@/src/theme";
import type { PublicZone } from "@/lib/api/client";

type ZoneCardProps = {
  zone: PublicZone;
  /** Selection handler; omit (or pass null) to make the zone non-selectable. */
  onPress?: (() => void) | null;
  selected?: boolean;
  testID?: string;
};

/**
 * Zone availability card. Optionally selectable for the Phase 9.3 manual
 * assignment flow: a zone can only be selected when the backend reports it as
 * ACTIVE, has capacity and still has free spaces. Selection is purely local UI
 * state — it never assigns, reserves or modifies occupancy.
 */
export function ZoneCard({ zone, onPress, selected = false, testID }: ZoneCardProps) {
  const hasCapacity = Number.isFinite(zone.capacity) && zone.capacity > 0;
  const percent = hasCapacity
    ? Math.round(Math.min(Math.max(zone.occupiedCount / zone.capacity, 0), 1) * 100)
    : 0;
  const isFull = hasCapacity && zone.availableCount <= 0;
  const selectable =
    onPress != null && zone.status === "ACTIVE" && hasCapacity && !isFull;

  const summary = `${hasCapacity
    ? `Zone ${zone.name}. ${zone.occupiedCount} of ${zone.capacity} spaces occupied. ${zone.availableCount} spaces available. ${percent} percent occupied.`
    : `Zone ${zone.name}. No capacity data available.`}${isFull ? " Full. No spaces available." : ""}${
    zone.status !== "ACTIVE" ? " Not available for assignment." : ""
  }${selected ? " Selected." : ""}`;

  function handlePress() {
    if (!selectable) {
      return;
    }
    onPress?.();
  }

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !selectable }}
      accessibilityLabel={summary}
      disabled={!selectable}
      onPress={handlePress}
      style={({ pressed }) => [styles.wrapper, pressed && selectable ? styles.pressed : undefined]}
      testID={testID}>
      <Card
        accent={selected ? colors.gold : colors.orange}
        style={[styles.card, selected ? styles.cardSelected : undefined]}>
        <View style={styles.headerRow}>
          <View style={styles.titleGroup}>
            <Text variant="title" numberOfLines={1}>
              {zone.name}
            </Text>
            <Text variant="mono">{zone.code}</Text>
          </View>
          <AvailabilityBadge
            status={zone.availability}
            testID={testID ? `${testID}-availability` : undefined}
          />
        </View>
        <CapacityBar
          occupied={zone.occupiedCount}
          capacity={zone.capacity}
          color={parkingStatusMeta(zone.availability).color}
          testID={testID ? `${testID}-occupancy` : undefined}
        />
        <View style={styles.metrics}>
          <Metric label="Free" value={String(zone.availableCount)} accent={colors.gold} icon="car-outline" testID={testID ? `${testID}-available` : undefined} />
          <Metric label="Capacity" value={String(zone.capacity)} accent={colors.muted} icon="grid-outline" testID={testID ? `${testID}-capacity` : undefined} />
          <Metric label="Occupied" value={String(zone.occupiedCount)} accent={colors.muted} icon="lock-closed-outline" testID={testID ? `${testID}-occupied` : undefined} />
        </View>
        {isFull ? (
          <View style={styles.stateRow} testID={testID ? `${testID}-unavailable` : undefined}>
            <Ionicons name="ban" size={14} color={colors.burntOrange} />
            <Text variant="caption" color={colors.burntOrange}>
              No spaces available
            </Text>
          </View>
        ) : null}
        {selected ? (
          <View style={styles.stateRow} testID={testID ? `${testID}-selected` : undefined}>
            <Ionicons name="checkmark-circle" size={14} color={colors.gold} />
            <Text variant="caption" color={colors.gold}>
              Selected
            </Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  card: {
    gap: spacing.xl2,
  },
  cardSelected: {
    borderColor: colors.gold,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  titleGroup: {
    gap: spacing.xs,
    flexShrink: 1,
  },
  metrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});