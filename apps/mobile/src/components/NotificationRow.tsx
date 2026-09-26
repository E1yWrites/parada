import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { notificationTypeMeta } from "./StatusBadge";
import { formatRelativeTime } from "@/lib/format";
import type { NotificationResponse } from "@parada/types";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

type NotificationRowProps = {
  notification: NotificationResponse;
  onPress?: () => void;
  now?: Date;
  testID?: string;
};

/** One row in the notification feed. Unread rows carry a raised surface,
 *  bold title and an unread dot — never color alone. */
export function NotificationRow({ notification, onPress, now, testID }: NotificationRowProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const meta = notificationTypeMeta(notification.type, colors);
  const unread = !notification.read;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.message}${unread ? ". Unread." : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, unread ? styles.unread : undefined, pressed ? styles.pressed : undefined]}
      testID={testID}>
      <View style={styles.iconSlot}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text variant={unread ? "bodySemi" : "body"} style={styles.title} numberOfLines={1}>
            {notificationTitle(notification.type)}
          </Text>
          <View style={styles.meta}>
            <Text variant="caption">{formatRelativeTime(notification.createdAt, now)}</Text>
            {unread ? (
              <View
                style={[styles.unreadDot, { backgroundColor: meta.color }]}
                testID={testID ? `${testID}-unread` : undefined}
              />
            ) : null}
          </View>
        </View>
        <Text variant="caption" color={unread ? colors.foreground : colors.muted} numberOfLines={2}>
          {notification.message}
        </Text>
      </View>
    </Pressable>
  );
}

/** Short row title derived from the notification type; `message` carries the
 *  full sentence (including any appeal outcome, which the type alone can't say). */
function notificationTitle(type: NotificationResponse["type"]): string {
  switch (type) {
    case "ZONE_FULL":
      return "Zone full";
    case "ZONE_LOW_AVAILABILITY":
      return "Low availability";
    case "RESERVATION_EXPIRING":
      return "Reservation expiring";
    case "GUEST_ADMISSION_ISSUE":
      return "Guest admission issue";
    case "WRONG_ZONE_WARNING":
      return "Wrong-zone warning";
    case "VIOLATION_ISSUED":
      return "Violation issued";
    case "VIOLATION_APPEAL_SUBMITTED":
      return "Appeal submitted";
    case "VIOLATION_APPEAL_RESULT":
      return "Appeal decision";
    case "SESSION_COMPLETED":
      return "Parking complete";
  }
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.lg,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderTopRightRadius: radii.cut,
      minHeight: 64,
    },
    unread: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: {
      opacity: 0.85,
    },
    iconSlot: {
      width: 22,
      alignItems: "center",
      paddingTop: spacing.xs,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
    },
    title: {
      flexShrink: 1,
    },
    meta: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: radii.full,
    },
  });
}
