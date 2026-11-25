import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PublicZone } from "@/lib/api/client";
import { heldSpaces } from "@/lib/format";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { CapacityBar } from "./CapacityBar";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";

type CampusOverviewProps = {
  zones: PublicZone[];
  leastBusyId: string | null;
  /** Opens Zones with this zone already chosen. */
  onChoose: (zoneId: string) => void;
};

/**
 * The idle Now tab's second half: every zone at a glance (parked / held /
 * free from GET /zones), tap one to go choose it. Only shown while the driver
 * has nothing planned.
 */
export function CampusOverview({ zones, leastBusyId, onChoose }: CampusOverviewProps) {
  const colors = useColors();
  const open = zones.filter((z) => z.status === "ACTIVE" && z.availableCount > 0).length;
  return (
    <View style={styles.wrap} testID="campus-overview">
      <SectionHeader title="Campus right now" caption={`${open} of ${zones.length} zones open`} />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        {zones.map((zone, i) => {
          const full = zone.availableCount <= 0 || zone.status !== "ACTIVE";
          return (
            <Pressable
              key={zone.id}
              accessibilityRole="button"
              accessibilityLabel={`${zone.name}: ${full ? "no spaces" : `${zone.availableCount} free`}. Choose this zone.`}
              disabled={full}
              onPress={() => onChoose(zone.id)}
              style={({ pressed }) => [
                styles.row,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined,
                pressed ? { backgroundColor: colors.surfaceElevated } : undefined,
              ]}
              testID={`campus-zone-${zone.code}`}>
              <View style={styles.line}>
                <Text variant="bodySemi" numberOfLines={1} style={styles.name}>
                  {zone.name}
                </Text>
                <PlateChip value={zone.code} tone="soft" size="sm" />
                {zone.id === leastBusyId ? (
                  <Ionicons name="trending-down" size={14} color={colors.successInk} accessibilityLabel="Least busy" />
                ) : null}
                <Text variant="caption" color={full ? colors.danger : colors.foreground} style={styles.free}>
                  {full ? "Full" : `${zone.availableCount} free`}
                </Text>
              </View>
              <CapacityBar occupied={zone.occupiedCount} capacity={zone.capacity} held={heldSpaces(zone)} color={colors.foreground} compact />
            </Pressable>
          );
        })}
        <View style={[styles.legend, { borderTopColor: colors.border }]}>
          <Legend color={colors.foreground} label="Parked" />
          <Legend color={colors.info} label="Held" />
          <Legend color={colors.surfaceElevated} label="Free" border={colors.borderStrong} />
        </View>
      </View>
    </View>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color, borderColor: border ?? color }]} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  row: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.md, minHeight: 56 },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { flexShrink: 1 },
  free: { marginLeft: "auto" },
  legend: {
    flexDirection: "row",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3, borderWidth: 1 },
});
