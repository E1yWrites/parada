import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Card } from "./Card";
import { ReservationBadge } from "./StatusBadge";
import { Text } from "./Text";
import { formatDateTime } from "@/lib/format";
import type { ReservationResponse } from "@parada/types";
import { colors, spacing } from "@/src/theme";

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
 * `onCancel` callback fires — no optimistic state mutation.
 */
export function ReservationCard({
  reservation,
  onCancel,
  cancelling = false,
  testID,
}: ReservationCardProps) {
  const [confirming, setConfirming] = useState(false);
  const cancellable =
    onCancel != null &&
    !cancelling &&
    (reservation.status === "CONFIRMED" ||
      reservation.status === "PENDING" ||
      reservation.status === "ACTIVE");

  return (
    <Card accent={colors.primary} testID={testID}>
      <View style={styles.row}>
        <View style={styles.heading}>
          <Text variant="title" numberOfLines={2}>
            {reservation.zone.name}
          </Text>
          <Text variant="mono">{reservation.zone.code}</Text>
        </View>
        <View style={styles.badgeSlot}>
          <ReservationBadge status={reservation.status} testID={testID ? `${testID}-status` : undefined} />
        </View>
      </View>

      <Text variant="plate" style={styles.plate}>
        {reservation.vehicle.plateNumber}
      </Text>

      <View style={styles.times}>
        <Text variant="caption">
          Start {formatDateTime(reservation.startAt)}
        </Text>
        <Text variant="caption">
          End {formatDateTime(reservation.endAt)}
        </Text>
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
                title="Confirm"
                loading={cancelling}
                onPress={onCancel}
                testID={testID ? `${testID}-cancel-confirm-btn` : undefined}
              />
            </View>
          ) : (
            <Button
              variant="danger"
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heading: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  badgeSlot: {
    flexShrink: 0,
  },
  plate: {
    marginTop: spacing.sm,
  },
  times: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  cancel: {
    marginTop: spacing.lg,
  },
  confirmRow: {
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
