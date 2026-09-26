import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./Button";
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
  /** Explicit cancel callback; omit to hide cancellation. */
  onCancel?: () => void;
  /** True while a cancel request is in flight. */
  cancelling?: boolean;
  testID?: string;
};

/**
 * Presentational reservation card. Displays the backend-confirmed fields
 * (zone, vehicle/plate, status, start/end). Cancellation is explicit: the user
 * taps "Cancel reservation" and then confirms in a second tap before the
 * `onCancel` callback fires — no optimistic state mutation. The destructive
 * control sits alone under a seam, away from the content.
 */
export function ReservationCard({
  reservation,
  onCancel,
  cancelling = false,
  testID,
}: ReservationCardProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const [confirming, setConfirming] = useState(false);
  const cancellable =
    onCancel != null &&
    !cancelling &&
    (reservation.status === "CONFIRMED" ||
      reservation.status === "PENDING" ||
      reservation.status === "ACTIVE");

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
        <View style={styles.windowText}>
          <Text variant="caption" color={colors.foreground}>
            Start {formatDateTime(reservation.startAt)}
          </Text>
          <Text variant="caption" color={colors.foreground}>
            End {formatDateTime(reservation.endAt)}
          </Text>
        </View>
      </View>

      {cancellable ? (
        <View style={styles.cancel}>
          {confirming ? (
            <View style={styles.confirmRow}>
              <Text variant="caption" style={styles.confirmText} testID={testID ? `${testID}-cancel-confirm` : undefined}>
                Cancel this reservation?
              </Text>
              <Button
                variant="danger"
                size="sm"
                title="Confirm"
                loading={cancelling}
                onPress={onCancel}
                testID={testID ? `${testID}-cancel-confirm-btn` : undefined}
              />
            </View>
          ) : (
            <Button
              variant="danger"
              size="sm"
              title="Cancel reservation"
              onPress={() => setConfirming(true)}
              testID={testID ? `${testID}-cancel` : undefined}
            />
          )}
        </View>
      ) : null}
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
    cancel: {
      marginTop: spacing.sm,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: "flex-start",
    },
    confirmRow: {
      alignSelf: "stretch",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    confirmText: {
      flexShrink: 1,
    },
  });
}
