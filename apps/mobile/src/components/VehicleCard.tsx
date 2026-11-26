import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Vehicle } from "@parada/types";
import { Card } from "./Card";
import { Text } from "./Text";
import { StatusBadge } from "./StatusBadge";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import { formatVehicleType } from "@/lib/format";
import type { ComponentProps } from "react";

type VehicleCardProps = {
  vehicle: Vehicle;
  onPress?: () => void;
  /** Shows a "primary" radio; tapping it makes this the primary vehicle. */
  onMakePrimary?: () => void;
  testID?: string;
};

function vehicleStatusMeta(
  status: Vehicle["status"],
  colors: ColorTokens,
): { label: string; icon: "checkmark-circle" | "power"; color: string } {
  return status === "ACTIVE"
    ? { label: "Active", icon: "checkmark-circle", color: colors.success }
    : { label: "Inactive", icon: "power", color: colors.muted };
}

const vehicleIcon: Record<Vehicle["vehicleType"], ComponentProps<typeof Ionicons>["name"]> = {
  CAR: "car-sport",
  MOTORCYCLE: "bicycle",
  VAN: "bus",
  TRUCK: "cube",
  OTHER: "car",
};

export function VehicleCard({ vehicle, onPress, onMakePrimary, testID }: VehicleCardProps) {
  const colors = useColors();
  const active = vehicle.status === "ACTIVE";
  return (
    <Card onPress={onPress} style={styles.card} testID={testID}>
      <View style={styles.iconSlot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons
          name={vehicleIcon[vehicle.vehicleType] ?? "car"}
          size={26}
          color={active ? colors.primaryDeep : colors.muted}
        />
      </View>
      <View style={styles.plateGroup}>
        <View style={styles.plateRow}>
          <Text variant="plate" testID={testID ? `${testID}-plate` : undefined}>
            {vehicle.plateNumber}
          </Text>
          {vehicle.isPrimary ? (
            <Text variant="micro" color={colors.primaryDeep} testID={testID ? `${testID}-primary` : undefined}>
              PRIMARY
            </Text>
          ) : null}
        </View>
        <Text variant="caption" numberOfLines={2} testID={testID ? `${testID}-type` : undefined}>
          {[formatVehicleType(vehicle.vehicleType), [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")]
            .filter((part) => part && part.length > 0)
            .join(" · ")}
        </Text>
      </View>
      {onMakePrimary ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: vehicle.isPrimary }}
          accessibilityLabel={`Primary vehicle: ${vehicle.plateNumber}`}
          hitSlop={10}
          disabled={vehicle.isPrimary}
          onPress={onMakePrimary}
          style={[styles.radio, { borderColor: vehicle.isPrimary ? colors.info : colors.borderStrong }]}
          testID={testID ? `${testID}-make-primary` : undefined}>
          {vehicle.isPrimary ? <View style={[styles.radioDot, { backgroundColor: colors.info }]} /> : null}
        </Pressable>
      ) : (
        <StatusBadge meta={vehicleStatusMeta(vehicle.status, colors)} size="sm" testID={testID ? `${testID}-status` : undefined} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  iconSlot: {
    width: 26,
    alignItems: "center",
  },
  plateGroup: {
    gap: spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  plateRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
});
