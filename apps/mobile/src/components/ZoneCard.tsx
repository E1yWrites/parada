import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { CapacityBar } from "./CapacityBar";
import { AvailabilityBadge } from "./StatusBadge";
import { PlateChip } from "./PlateChip";
import { Text } from "./Text";
import { motion, radii, spacing, touchTarget } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import { heldSpaces } from "@/lib/format";
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
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected, disabled: !selectable }}
      accessibilityLabel={summary}
      disabled={!selectable}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : undefined,
        pressed && selectable ? styles.pressed : undefined,
      ]}
      testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.nameBlock}>
          <View style={styles.nameLine}>
            <Text variant="section" numberOfLines={2} style={styles.name}>
              {zone.name}
            </Text>
            <PlateChip value={zone.code} tone="soft" size="sm" />
          </View>
          <View style={styles.nameLine}>
            <Text variant="caption" testID={testID ? `${testID}-occupancy-percent` : undefined}>
              {hasCapacity ? `${zone.occupiedCount} of ${zone.capacity} · ${percent}%` : "No capacity data"}
            </Text>
            {/* "Available" is the normal case and goes unsaid; only Low / Full / Closed get a badge. */}
            {zone.availability !== "AVAILABLE" ? (
              <AvailabilityBadge status={zone.availability} testID={testID ? `${testID}-availability` : undefined} />
            ) : null}
            {selected ? (
              <View style={styles.stateRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.infoInk} />
                <Text variant="caption" color={colors.infoInk}>
                  Selected
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.countBlock}>
          <Text
            variant="display"
            color={isFull ? colors.danger : colors.foreground}
            style={styles.count}
            testID={testID ? `${testID}-available` : undefined}>
            {String(zone.availableCount)}
          </Text>
          <Text variant="caption">free</Text>
        </View>
      </View>

      <CapacityBar
        occupied={zone.occupiedCount}
        capacity={zone.capacity}
        color={colors.foreground}
        held={heldSpaces(zone)}
        compact
        testID={testID ? `${testID}-occupancy` : undefined}
      />

      <View style={styles.footerRow}>
        {isFull ? (
          <View style={styles.stateRow} testID={testID ? `${testID}-unavailable` : undefined}>
            <Ionicons name="ban" size={14} color={colors.danger} />
            <Text variant="caption" color={colors.danger}>
              No spaces available
            </Text>
          </View>
        ) : leastBusy ? (
          <View style={styles.stateRow} testID={testID ? `${testID}-least-busy` : undefined}>
            <Ionicons name="trending-down" size={14} color={colors.successInk} />
            <Text variant="caption" color={colors.successInk}>
              Least busy
            </Text>
          </View>
        ) : (
          <View />
        )}
        {isFull && leastBusy ? (
          <View style={styles.stateRow} testID={testID ? `${testID}-least-busy` : undefined}>
            <Text variant="caption" color={colors.successInk}>
              Least busy
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Details for ${zone.name}`}
          hitSlop={8}
          onPress={() => router.push(`/zones/${zone.id}`)}
          style={({ pressed }) => [styles.detailsLink, pressed ? styles.detailsPressed : undefined]}
          testID={testID ? `${testID}-details` : undefined}>
          <Text variant="caption" color={colors.primaryDeep}>
            Details
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primaryDeep} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // A list row, not a floating card: an opaque surface (an Android elevation
    // shadow shows through a translucent fill as a grey box), a hairline, and
    // selection drawn as a 2pt border with a "Selected" mark — no tinted fill.
    row: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: "transparent",
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      gap: spacing.md,
    },
    rowSelected: {
      // primaryDeep clears 3:1 against the surface (WCAG 1.4.11).
      borderColor: colors.primaryDeep,
    },
    pressed: {
      opacity: 0.94,
      transform: [{ scale: motion.pressScale }],
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    nameBlock: {
      flex: 1,
      minWidth: 0,
      gap: spacing.sm,
    },
    nameLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      flexWrap: "wrap",
    },
    name: {
      flexShrink: 1,
    },
    countBlock: {
      alignItems: "flex-end",
    },
    count: {
      fontSize: 34,
      lineHeight: 38,
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    detailsLink: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
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
