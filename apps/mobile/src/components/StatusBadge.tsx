import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors, radii, spacing } from "@/src/theme";
import { Text } from "./Text";

type ZoneAvailability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";
type SessionStatus = "ACTIVE" | "COMPLETED";
type ReservationStatus = "PENDING" | "CONFIRMED" | "ACTIVE" | "EXPIRED" | "CANCELLED";
type ZoneAssignmentStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

type StatusMeta = {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  color: string;
};

/** Zone availability → icon + text + color (never color alone). */
export function parkingStatusMeta(status: ZoneAvailability): StatusMeta {
  switch (status) {
    case "AVAILABLE":
      return { label: "Available", icon: "checkmark-circle", color: colors.success };
    case "LOW_AVAILABILITY":
      return { label: "Low", icon: "alert-circle", color: colors.gold };
    case "FULL":
      return { label: "Full", icon: "ban", color: colors.burntOrange };
    case "OFFLINE":
      return { label: "Offline", icon: "power", color: colors.muted };
  }
}

export function sessionStatusMeta(status: SessionStatus): StatusMeta {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", icon: "pulse", color: colors.orange };
    case "COMPLETED":
      return { label: "Completed", icon: "checkmark-done", color: colors.muted };
  }
}

/** Reservation status → icon + text + color (phase 9.4). */
export function reservationStatusMeta(status: ReservationStatus): StatusMeta {
  switch (status) {
    case "CONFIRMED":
      return { label: "Confirmed", icon: "checkmark-circle", color: colors.success };
    case "ACTIVE":
      return { label: "Active", icon: "pulse", color: colors.orange };
    case "PENDING":
      return { label: "Pending", icon: "time", color: colors.gold };
    case "EXPIRED":
      return { label: "Expired", icon: "hourglass", color: colors.muted };
    case "CANCELLED":
      return { label: "Cancelled", icon: "close-circle", color: colors.muted };
  }
}

/** Zone-assignment status → icon + text + color (phase 9.6 current state). */
export function assignmentStatusMeta(status: ZoneAssignmentStatus): StatusMeta {
  switch (status) {
    case "ACTIVE":
      return { label: "Assigned", icon: "location", color: colors.gold };
    case "EXPIRED":
      return { label: "Expired", icon: "hourglass", color: colors.muted };
    case "REVOKED":
      return { label: "Revoked", icon: "close-circle", color: colors.muted };
  }
}

type StatusBadgeProps = {
  meta: StatusMeta;
  size?: "sm" | "md";
  testID?: string;
};

/** Small pill combining a status icon, text and semantic color. */
export function StatusBadge({ meta, size = "md", testID }: StatusBadgeProps) {
  const compact = size === "sm";
  return (
    <View
      testID={testID}
      accessibilityLabel={meta.label}
      style={[
        styles.badge,
        { borderColor: meta.color, backgroundColor: withAlpha(meta.color, 0.12) },
        compact ? styles.badgeSm : undefined,
      ]}>
      <Ionicons name={meta.icon} size={compact ? 12 : 14} color={meta.color} />
      <Text variant={compact ? "micro" : "caption"} color={meta.color} style={styles.label}>
        {meta.label}
      </Text>
    </View>
  );
}

export function AvailabilityBadge({ status, testID }: { status: ZoneAvailability; testID?: string }) {
  return <StatusBadge meta={parkingStatusMeta(status)} testID={testID} />;
}

export function SessionBadge({
  status,
  size = "md",
  testID,
}: {
  status: SessionStatus;
  size?: "sm" | "md";
  testID?: string;
}) {
  return <StatusBadge meta={sessionStatusMeta(status)} size={size} testID={testID} />;
}

export function ReservationBadge({
  status,
  size = "sm",
  testID,
}: {
  status: ReservationStatus;
  size?: "sm" | "md";
  testID?: string;
}) {
  return <StatusBadge meta={reservationStatusMeta(status)} size={size} testID={testID} />;
}

export function AssignmentBadge({
  status,
  size = "sm",
  testID,
}: {
  status: ZoneAssignmentStatus;
  size?: "sm" | "md";
  testID?: string;
}) {
  return <StatusBadge meta={assignmentStatusMeta(status)} size={size} testID={testID} />;
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeSm: {
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  label: {
    letterSpacing: 0.3,
  },
});