import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card } from "./Card";
import { CapacityBar } from "./CapacityBar";
import { AvailabilityBadge, parkingStatusMeta } from "./StatusBadge";
import { Metric } from "./Metric";
import { PlateChip } from "./PlateChip";
import { Text } from "./Text";
import { motion, radii, spacing, touchTarget } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import type { PublicZone } from "@/lib/api/client";

type ZoneCardProps = {
  zone: PublicZone;
  /** Selection handler; omit (or pass null) to make the zone non-selectable. */
  onPress?: (() => void) | null;
  selected?: boolean;
  /** This zone is the backend's least-occupied pick (GET /zones/recommendation). */
  leastBusy?: boolean;
  testID?: string;
};

/**
 * Zone "lane" card: the code plate and availability stamp lead, then the
 * available-space count and a single occupancy bar (which already states
 * "occupied of capacity"), so capacity and occupied are never repeated as
 * separate numbers. Optionally selectable for the Phase 9.3 manual
 * assignment flow: a zone can only be selected when the backend reports it
 * as ACTIVE, has capacity and still has free spaces. Selection is purely
 * local UI state — it never assigns, reserves or modifies occupancy.
 */
export function ZoneCard({ zone, onPress, selected = false, leastBusy = false, testID }: ZoneCardProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const router = useRouter();
  const hasCapacity = Number.isFinite(zone.capacity) && zone.capacity > 0;
  const percent = hasCapacity
    ? Math.round(Math.min(Math.max(zone.occupiedCount / zone.capacity, 0), 1) * 100)
    : 0;
  const isFull = hasCapacity && zone.availableCount <= 0;
  const selectable = onPress != null && zone.status === "ACTIVE" && hasCapacity && !isFull;
  const status = parkingStatusMeta(zone.availability, colors);

  const summary = `${hasCapacity
    ? `Zone ${zone.name}. ${zone.occupiedCount} of ${zone.capacity} spaces occupied. ${zone.availableCount} spaces available. ${percent} percent occupied.`
    : `Zone ${zone.name}. No capacity data available.`}${isFull ? " Full. No spaces available." : ""}${
    zone.status !== "ACTIVE" ? " Not available for assignment." : ""
  }${leastBusy ? " Least busy zone." : ""}`;

  function handlePress() {
    if (!selectable) {
      return;
    }
    onPress?.();
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, selected, disabled: !selectable }}
        accessibilityLabel={summary}
        disabled={!selectable}
        onPress={handlePress}
        style={({ pressed }) => [styles.wrapper, pressed && selectable ? styles.pressed : undefined]}
        testID={testID}>
        <Card
          padding={spacing.lg}
          style={[styles.card, selected ? styles.cardSelected : undefined]}
          shadowColor={selected ? colors.primary : undefined}
          shadowOpacity={selected ? 0.2 : undefined}>
          <View style={styles.headerRow}>
            <PlateChip value={zone.code} />
            <AvailabilityBadge
              status={zone.availability}
              testID={testID ? `${testID}-availability` : undefined}
            />
          </View>

          <Text variant="title" numberOfLines={2}>
            {zone.name}
          </Text>

          <Metric
            label="Available"
            value={String(zone.availableCount)}
            accent={isFull ? colors.danger : status.color === colors.muted ? colors.foreground : status.color}
            size="lg"
            testID={testID ? `${testID}-available` : undefined}
          />

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
          {leastBusy ? (
            <View style={styles.stateRow} testID={testID ? `${testID}-least-busy` : undefined}>
              <Ionicons name="trending-down" size={14} color={colors.successInk} />
              <Text variant="caption" color={colors.successInk}>
                Least busy
              </Text>
            </View>
          ) : null}
        </Card>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Details for ${zone.name}`}
        onPress={() => router.push(`/zones/${zone.id}`)}
        style={({ pressed }) => [styles.detailsLink, pressed ? styles.detailsPressed : undefined]}
        testID={testID ? `${testID}-details` : undefined}>
        <Text variant="caption" color={colors.primaryDeep}>
          Details
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primaryDeep} />
      </Pressable>
    </View>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    wrapper: {
      flex: 1,
      gap: spacing.xs,
    },
    pressed: {
      opacity: 0.94,
      transform: [{ scale: motion.pressScale }],
    },
    card: {
      gap: spacing.lg,
    },
    cardSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    detailsLink: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      borderTopRightRadius: radii.cut,
    },
    detailsPressed: {
      backgroundColor: colors.surfaceElevated,
    },
    stateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
  });
}
