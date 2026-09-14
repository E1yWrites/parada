import { StyleSheet, View } from "react-native";
import type { Vehicle } from "@parada/types";
import { Card } from "./Card";
import { IconTile } from "./IconTile";
import { Text } from "./Text";
import { StatusBadge } from "./StatusBadge";
import { colors, spacing } from "@/src/theme";
import { formatVehicleType } from "@/lib/format";
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type VehicleCardProps = {
  vehicle: Vehicle;
  onPress?: () => void;
  testID?: string;
};

const vehicleStatusMeta: Record<Vehicle["status"], { label: string; icon: "checkmark-circle" | "power"; color: string }> = {
  ACTIVE: { label: "Active", icon: "checkmark-circle", color: colors.success },
  INACTIVE: { label: "Inactive", icon: "power", color: colors.muted },
};

const vehicleIcon: Record<Vehicle["vehicleType"], ComponentProps<typeof Ionicons>["name"]> = {
  CAR: "car-sport",
  MOTORCYCLE: "bicycle",
  VAN: "bus",
  TRUCK: "cube",
  OTHER: "car",
};

export function VehicleCard({ vehicle, onPress, testID }: VehicleCardProps) {
  const active = vehicle.status === "ACTIVE";
  return (
    <Card onPress={onPress} style={styles.card} testID={testID}>
      <IconTile
        icon={vehicleIcon[vehicle.vehicleType] ?? "car"}
        color={active ? colors.primary : colors.muted}
        size={48}
      />
      <View style={styles.plateGroup}>
        <Text variant="plate" testID={testID ? `${testID}-plate` : undefined}>
          {vehicle.plateNumber}
        </Text>
        <Text variant="caption" numberOfLines={2} testID={testID ? `${testID}-type` : undefined}>
          {[formatVehicleType(vehicle.vehicleType), [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")]
            .filter((part) => part && part.length > 0)
            .join(" · ")}
        </Text>
      </View>
      <StatusBadge meta={vehicleStatusMeta[vehicle.status]} size="sm" testID={testID ? `${testID}-status` : undefined} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  plateGroup: {
    gap: spacing.xs,
    flex: 1,
    minWidth: 0,
  },
});
