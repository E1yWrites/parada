import { StyleSheet, View } from "react-native";
import type { Vehicle } from "@parada/types";
import { Card } from "./Card";
import { Text } from "./Text";
import { StatusBadge } from "./StatusBadge";
import { colors, spacing } from "@/src/theme";
import { formatVehicleType } from "@/lib/format";

type VehicleCardProps = {
  vehicle: Vehicle;
  onPress?: () => void;
  testID?: string;
};

const vehicleStatusMeta: Record<Vehicle["status"], { label: string; icon: "checkmark-circle" | "power"; color: string }> = {
  ACTIVE: { label: "Active", icon: "checkmark-circle", color: colors.success },
  INACTIVE: { label: "Inactive", icon: "power", color: colors.muted },
};

export function VehicleCard({ vehicle, onPress, testID }: VehicleCardProps) {
  return (
    <Card onPress={onPress} accent={colors.gold} style={styles.card} testID={testID}>
      <View style={styles.row}>
        <View style={styles.plateGroup}>
          <Text variant="micro">PLATE</Text>
          <Text variant="plate" testID={testID ? `${testID}-plate` : undefined}>
            {vehicle.plateNumber}
          </Text>
        </View>
        <View style={styles.metaGroup}>
          <Text variant="caption" testID={testID ? `${testID}-type` : undefined}>
            {formatVehicleType(vehicle.vehicleType)}
          </Text>
          <StatusBadge meta={vehicleStatusMeta[vehicle.status]} size="sm" testID={testID ? `${testID}-status` : undefined} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  plateGroup: {
    gap: spacing.sm,
    flexShrink: 1,
  },
  metaGroup: {
    alignItems: "flex-end",
    gap: spacing.sm,
  },
});