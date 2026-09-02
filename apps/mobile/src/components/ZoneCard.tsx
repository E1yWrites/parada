import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { AvailabilityBadge } from "./StatusBadge";
import { Metric } from "./Metric";
import { Text } from "./Text";
import { colors, spacing } from "@/src/theme";
import type { PublicZone } from "@/lib/api/client";

type ZoneCardProps = {
  zone: PublicZone;
  onPress?: () => void;
  testID?: string;
};

export function ZoneCard({ zone, onPress, testID }: ZoneCardProps) {
  return (
    <Card onPress={onPress} accent={colors.orange} style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text variant="title" numberOfLines={1}>
            {zone.name}
          </Text>
          <Text variant="mono">{zone.code}</Text>
        </View>
        <AvailabilityBadge status={zone.availability} testID={testID ? `${testID}-availability` : undefined} />
      </View>
      <View style={styles.metrics}>
        <Metric label="Free" value={String(zone.availableCount)} accent={colors.gold} icon="car-outline" testID={testID ? `${testID}-available` : undefined} />
        <Metric label="Capacity" value={String(zone.capacity)} accent={colors.muted} icon="grid-outline" testID={testID ? `${testID}-capacity` : undefined} />
        <Metric label="Occupied" value={String(zone.occupiedCount)} accent={colors.muted} icon="lock-closed-outline" testID={testID ? `${testID}-occupied` : undefined} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl2,
    flex: 1,
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
});