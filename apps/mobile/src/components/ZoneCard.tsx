import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card } from "./Card";
import { CapacityBar } from "./CapacityBar";
import { AvailabilityBadge, parkingStatusMeta } from "./StatusBadge";
import { Metric } from "./Metric";
import { PlateChip } from "./PlateChip";
import { Text } from "./Text";
import { colors, motion, radii, spacing, touchTarget } from "@/src/theme";
import type { PublicZone } from "@/lib/api/client";

type ZoneCardProps = {
  zone: PublicZone;
  /** Selection handler; omit (or pass null) to make the zone non-selectable. */
  onPress?: (() => void) | null;
  selected?: boolean;
  testID?: string;
};

/**
 * Zone "lane" card: the code plate, the live availability stamp and the free
 * count lead; capacity and occupied sit beside it in smaller data. Optionally
 * selectable for the Phase 9.3 manual assignment flow: a zone can only be
 * selected when the backend reports it as ACTIVE, has capacity and still has
 * free spaces. Selection is purely local UI state — it never assigns,
 * reserves or modifies occupancy.
 */
export function ZoneCard({ zone, onPress, selected = false, testID }: ZoneCardProps) {
  const router = useRouter();
  const hasCapacity = Number.isFinite(zone.capacity) && zone.capacity > 0;
  const percent = hasCapacity
    ? Math.round(Math.min(Math.max(zone.occupiedCount / zone.capacity, 0), 1) * 100)
    : 0;
  const isFull = hasCapacity && zone.availableCount <= 0;
  const selectable = onPress != null && zone.status === "ACTIVE" && hasCapacity && !isFull;
  const status = parkingStatusMeta(zone.availability);

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
      <Card style={[styles.card, selected ? styles.cardSelected : undefined]}>
        <View style={styles.headerRow}>
          <PlateChip value={zone.code} />
          <View style={styles.badgeSlot}>
            <AvailabilityBadge
              status={zone.availability}
              testID={testID ? `${testID}-availability` : undefined}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View details for ${zone.name}`}
              onPress={() => router.push(`/zones/${zone.id}`)}
              hitSlop={6}
              style={({ pressed }) => [styles.detailsButton, pressed ? styles.detailsPressed : undefined]}
              testID={testID ? `${testID}-details` : undefined}>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <Text variant="title" numberOfLines={2}>
          {zone.name}
        </Text>

        <View style={styles.countRow}>
          <Metric
            label="Free"
            value={String(zone.availableCount)}
            accent={isFull ? colors.danger : status.color === colors.muted ? colors.foreground : status.color}
            size="lg"
            testID={testID ? `${testID}-available` : undefined}
          />
          <View style={styles.sideMetrics}>
            <Metric label="Capacity" value={String(zone.capacity)} testID={testID ? `${testID}-capacity` : undefined} />
            <Metric label="Occupied" value={String(zone.occupiedCount)} testID={testID ? `${testID}-occupied` : undefined} />
          </View>
        </View>

        <CapacityBar
          occupied={zone.occupiedCount}
          capacity={zone.capacity}
          color={status.color}
          testID={testID ? `${testID}-occupancy` : undefined}
        />

        {isFull ? (
          <View style={styles.stateRow} testID={testID ? `${testID}-unavailable` : undefined}>
            <Ionicons name="ban" size={14} color={colors.danger} />
            <Text variant="caption" color={colors.danger}>
              No spaces available
            </Text>
          </View>
        ) : null}
        {selected ? (
          <View style={[styles.stateRow, styles.selectedRow]} testID={testID ? `${testID}-selected` : undefined}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text variant="caption" color={colors.primary} style={styles.selectedText}>
              Selected for assignment or reservation
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
    opacity: 0.94,
    transform: [{ scale: motion.pressScale }],
  },
  card: {
    gap: spacing.lg,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  badgeSlot: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailsButton: {
    minWidth: 32,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
  },
  detailsPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  sideMetrics: {
    flexDirection: "row",
    gap: spacing.xl2,
    paddingBottom: spacing.sm,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  selectedRow: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  selectedText: {
    flexShrink: 1,
  },
});
