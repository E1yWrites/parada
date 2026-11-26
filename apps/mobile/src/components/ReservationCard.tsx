import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { ReservationBadge } from "./StatusBadge";
import { Text } from "./Text";
import { formatClockTime, formatDateTime } from "@/lib/format";
import type { ReservationResponse } from "@parada/types";
import { spacing } from "@/src/theme";
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
          <Text variant="title" numberOfLines={2} style={styles.shrink}>
            {reservation.zone.name}
          </Text>
          <PlateChip value={reservation.zone.code} tone="soft" size="sm" style={styles.chip} />
        </View>
        <ReservationBadge status={reservation.status} testID={testID ? `${testID}-status` : undefined} />
      </View>
      <View style={styles.meta}>
        <Ionicons name="time-outline" size={14} color={colors.muted} />
        <Text variant="caption" style={styles.shrink} testID={testID ? `${testID}-window` : undefined}>
          {formatDateTime(reservation.startAt)} – {formatClockTime(reservation.endAt)}
        </Text>
      </View>
      <View style={styles.meta}>
        <Ionicons name="car-outline" size={14} color={colors.muted} />
        <Text variant="caption">{reservation.vehicle.plateNumber}</Text>
      </View>
    </Card>
  );
}

function buildStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    card: { gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg },
    heading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.md },
    shrink: { flexShrink: 1 },
    chip: { flexShrink: 0 },
    meta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  });
}
