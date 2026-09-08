import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { notificationTypeMeta } from "./StatusBadge";
import { formatRelativeTime } from "@/lib/format";
import type { NotificationResponse } from "@parada/types";
import { colors, radii, spacing } from "@/src/theme";

type NotificationRowProps = {
  notification: NotificationResponse;
  onPress?: () => void;
  now?: Date;
  testID?: string;
};

/** One row in the notification feed. Unread rows carry a tinted background
 *  and a colored accent bar — never color alone (icon + label also change). */
export function NotificationRow({ notification, onPress, now, testID }: NotificationRowProps) {
  const meta = notificationTypeMeta(notification.type);
  const unread = !notification.read;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.message}${unread ? ". Unread." : ""}`}
      onPress={onPress}
      style={[styles.row, unread ? styles.unread : undefined]}
      testID={testID}>
      {unread ? <View style={[styles.accent, { backgroundColor: meta.color }]} testID={testID ? `${testID}-unread` : undefined} /> : null}
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(meta.color) }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text variant={unread ? "bodySemi" : "body"} style={styles.title} numberOfLines={1}>
            {notificationTitle(notification.type)}
          </Text>
          <Text variant="caption" style={styles.time}>
            {formatRelativeTime(notification.createdAt, now)}
          </Text>
        </View>
        <Text variant="caption" color={colors.muted} numberOfLines={2}>
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
  }
}

function withAlpha(hex: string): string {
  return `${hex}24`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.md,
    position: "relative",
  },
  unread: {
    backgroundColor: colors.surfaceElevated,
  },
  accent: {
    position: "absolute",
    left: 0,
    top: spacing.md,
    bottom: spacing.md,
    width: 3,
    borderRadius: 3,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
  },
  time: {
    flexShrink: 0,
  },
});
