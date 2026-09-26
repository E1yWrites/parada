import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { ReservationBadge } from "./StatusBadge";
import { Text } from "./Text";
import { formatDateTime } from "@/lib/format";
import type { ReservationResponse } from "@parada/types";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

type ReservationCardProps = {
  reservation: ReservationResponse;
  testID?: string;
};

/**
 * One past reservation in History: zone, plate, backend status and the window
 * it covered. Read-only — a live reservation is shown and cancelled on Now.
 */
export function ReservationCard({ reservation, testID }: ReservationCardProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);

  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.row}>
        <View style={styles.heading}>
          <PlateChip value={reservation.zone.code} tone="soft" size="sm" />
          <Text variant="title" numberOfLines={2}>
            {reservation.zone.name}
          </Text>
        </View>
        <View style={styles.badgeSlot}>
          <ReservationBadge status={reservation.status} testID={testID ? `${testID}-status` : undefined} />
        </View>
      </View>

      <Text variant="plate">{reservation.vehicle.plateNumber}</Text>

      <View style={styles.window}>
        <View style={styles.windowIcon}>
          <Ionicons name="time-outline" size={16} color={colors.primaryDeep} />
        </View>
        <Text variant="caption" color={colors.foreground} style={styles.windowText} testID={testID ? `${testID}-window` : undefined}>
          {formatDateTime(reservation.startAt)} – {formatDateTime(reservation.endAt)}
        </Text>
      </View>
    </Card>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      gap: spacing.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    heading: {
      flex: 1,
      minWidth: 0,
      gap: spacing.md,
    },
    badgeSlot: {
      flexShrink: 0,
    },
    window: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radii.sm,
      borderTopRightRadius: radii.cut,
      padding: spacing.lg,
    },
    windowIcon: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      borderTopRightRadius: radii.cut,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    windowText: {
      flex: 1,
      gap: spacing.xs,
    },
  });
}
