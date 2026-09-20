import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { fonts, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { softColor, type ColorTokens } from "@/src/theme/colors";
import { Text } from "./Text";
import type { NotificationType, ViolationStatus } from "@parada/types";

type ZoneAvailability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";
type SessionStatus = "ACTIVE" | "COMPLETED";
type ReservationStatus = "PENDING" | "CONFIRMED" | "ACTIVE" | "EXPIRED" | "CANCELLED";
type ZoneAssignmentStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "CANCELLED";

type StatusMeta = {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  color: string;
};

/** Zone availability → icon + text + color (never color alone). */
export function parkingStatusMeta(status: ZoneAvailability, colors: ColorTokens): StatusMeta {
  switch (status) {
    case "AVAILABLE":
      return { label: "Available", icon: "checkmark-circle", color: colors.success };
    case "LOW_AVAILABILITY":
      return { label: "Low", icon: "alert-circle", color: colors.warning };
    case "FULL":
      return { label: "Full", icon: "ban", color: colors.danger };
    case "OFFLINE":
      return { label: "Offline", icon: "power", color: colors.muted };
  }
}

export function sessionStatusMeta(status: SessionStatus, colors: ColorTokens): StatusMeta {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", icon: "pulse", color: colors.primaryDeep };
    case "COMPLETED":
      return { label: "Completed", icon: "checkmark-done", color: colors.muted };
  }
}

/** Reservation status → icon + text + color (phase 9.4). */
export function reservationStatusMeta(status: ReservationStatus, colors: ColorTokens): StatusMeta {
  switch (status) {
    case "CONFIRMED":
      return { label: "Confirmed", icon: "checkmark-circle", color: colors.success };
    case "ACTIVE":
      return { label: "Active", icon: "pulse", color: colors.primaryDeep };
    case "PENDING":
      return { label: "Pending", icon: "time", color: colors.warning };
    case "EXPIRED":
      return { label: "Expired", icon: "hourglass", color: colors.muted };
    case "CANCELLED":
      return { label: "Cancelled", icon: "close-circle", color: colors.muted };
  }
}

/** Zone-assignment status → icon + text + color (phase 9.6 current state). */
export function assignmentStatusMeta(status: ZoneAssignmentStatus, colors: ColorTokens): StatusMeta {
  switch (status) {
    case "ACTIVE":
      return { label: "Assigned", icon: "location", color: colors.primaryDeep };
    case "EXPIRED":
      return { label: "Expired", icon: "hourglass", color: colors.muted };
    case "REVOKED":
      return { label: "Revoked", icon: "close-circle", color: colors.muted };
    case "CANCELLED":
      return { label: "Cancelled", icon: "close-circle", color: colors.muted };
  }
}

/** Violation status → icon + text + color. A violation is only appealable
 *  while PENDING; APPEALED means the driver is waiting on a decision. */
export function violationStatusMeta(status: ViolationStatus, colors: ColorTokens): StatusMeta {
  switch (status) {
    case "PENDING":
      return { label: "Pending", icon: "alert-circle", color: colors.warning };
    case "APPEALED":
      return { label: "Under review", icon: "hourglass", color: colors.muted };
    case "UPHELD":
      return { label: "Upheld", icon: "close-circle", color: colors.danger };
    case "DISMISSED":
      return { label: "Dismissed", icon: "checkmark-circle", color: colors.success };
    case "FINE_PAID":
      return { label: "Paid", icon: "checkmark-done", color: colors.muted };
  }
}

/** Notification type → icon + color for the notification feed. Never asserts
 *  an appeal's outcome from its type alone — the message text carries that. */
export function notificationTypeMeta(
  type: NotificationType,
  colors: ColorTokens,
): { icon: StatusMeta["icon"]; color: string } {
  switch (type) {
    case "ZONE_FULL":
      return { icon: "ban", color: colors.danger };
    case "ZONE_LOW_AVAILABILITY":
      return { icon: "alert-circle", color: colors.warning };
    case "RESERVATION_EXPIRING":
      return { icon: "time", color: colors.warning };
    case "GUEST_ADMISSION_ISSUE":
      return { icon: "alert-circle", color: colors.danger };
    case "WRONG_ZONE_WARNING":
      return { icon: "alert-circle", color: colors.warning };
    case "VIOLATION_ISSUED":
      return { icon: "alert-circle", color: colors.danger };
    case "VIOLATION_APPEAL_SUBMITTED":
      return { icon: "hourglass", color: colors.muted };
    case "VIOLATION_APPEAL_RESULT":
      return { icon: "chatbubble-ellipses", color: colors.primaryDeep };
    case "SESSION_COMPLETED":
      return { icon: "checkmark-done", color: colors.success };
  }
}

type StatusBadgeProps = {
  meta: StatusMeta;
  size?: "sm" | "md";
  testID?: string;
};

/** Small pill combining a status icon, text and semantic color. */
export function StatusBadge({ meta, size = "md", testID }: StatusBadgeProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(), []);
  const compact = size === "sm";
  return (
    <View
      testID={testID}
      accessibilityLabel={meta.label}
      style={[styles.badge, { backgroundColor: softColor(meta.color, colors) }, compact ? styles.badgeSm : undefined]}>
      <Ionicons name={meta.icon} size={compact ? 12 : 14} color={meta.color} />
      <Text variant={compact ? "micro" : "caption"} color={meta.color} style={compact ? styles.labelSm : styles.label}>
        {meta.label}
      </Text>
    </View>
  );
}

export function AvailabilityBadge({ status, testID }: { status: ZoneAvailability; testID?: string }) {
  const colors = useColors();
  return <StatusBadge meta={parkingStatusMeta(status, colors)} testID={testID} />;
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
  const colors = useColors();
  return <StatusBadge meta={sessionStatusMeta(status, colors)} size={size} testID={testID} />;
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
  const colors = useColors();
  return <StatusBadge meta={reservationStatusMeta(status, colors)} size={size} testID={testID} />;
}

export function ViolationBadge({
  status,
  size = "md",
  testID,
}: {
  status: ViolationStatus;
  size?: "sm" | "md";
  testID?: string;
}) {
  const colors = useColors();
  return <StatusBadge meta={violationStatusMeta(status, colors)} size={size} testID={testID} />;
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
  const colors = useColors();
  return <StatusBadge meta={assignmentStatusMeta(status, colors)} size={size} testID={testID} />;
}

function buildStyles() {
  return StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 1,
      borderRadius: radii.full,
      alignSelf: "flex-start",
    },
    badgeSm: {
      paddingHorizontal: spacing.md + 2,
      paddingVertical: 3,
    },
    label: {
      fontFamily: fonts.bodyBold,
    },
    labelSm: {
      letterSpacing: 0.3,
    },
  });
}
