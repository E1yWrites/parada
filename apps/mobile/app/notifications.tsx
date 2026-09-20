import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, NotificationRow, Screen, Text } from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import type { NotificationResponse } from "@parada/types";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

/** Groups newest-first notifications into "Today" and "Earlier" buckets. */
function groupByDay(notifications: NotificationResponse[], now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today: NotificationResponse[] = [];
  const earlier: NotificationResponse[] = [];
  for (const n of notifications) {
    const t = new Date(n.createdAt).getTime();
    (Number.isFinite(t) && t >= startOfToday ? today : earlier).push(n);
  }
  return { today, earlier };
}

export default function NotificationsScreen() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });

  // No bulk "mark all read" endpoint exists yet — this fires one real
  // markNotificationRead call per unread notification rather than faking a
  // single request.
  const markAllRead = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.markNotificationRead(id))),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });

  const now = useMemo(() => new Date(), []);
  const all = notifications.data?.notifications ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const { today, earlier } = groupByDay(all, now);

  return (
    <Screen
      back
      title="Notifications"
      refreshing={notifications.isFetching}
      onRefresh={() => void notifications.refetch()}
      testID="notifications-screen">
      {unreadCount > 0 ? (
        <View style={styles.headerRow}>
          <View style={styles.unreadBadge} testID="notifications-unread-count">
            <Text variant="micro" color={colors.danger}>
              {unreadCount}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications read"
            disabled={markAllRead.isPending}
            onPress={() => markAllRead.mutate(all.filter((n) => !n.read).map((n) => n.id))}
            hitSlop={12}
            testID="notifications-mark-all-read">
            <Text variant="caption" color={colors.primaryDeep}>
              {markAllRead.isPending ? "Marking…" : "Mark all read"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notifications.isPending ? (
        <LoadingState label="Loading your notifications…" testID="notifications-loading" />
      ) : notifications.isError ? (
        <ErrorState
          message={
            notifications.error instanceof ApiError
              ? notifications.error.message
              : "Couldn't load your notifications."
          }
          onRetry={() => void notifications.refetch()}
          testID="notifications-error"
        />
      ) : today.length === 0 && earlier.length === 0 ? (
        <EmptyState
          illustration="bell"
          title="No notifications yet"
          description="Session, reservation and violation updates will show up here."
          testID="notifications-empty"
        />
      ) : (
        <>
          {today.length > 0 ? (
            <View style={styles.group} testID="notifications-today">
              <Text variant="micro" style={styles.groupLabel}>
                TODAY
              </Text>
              {today.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  now={now}
                  onPress={() => (n.read ? undefined : markRead.mutate(n.id))}
                  testID={`notification-${n.id}`}
                />
              ))}
            </View>
          ) : null}
          {earlier.length > 0 ? (
            <View style={styles.group} testID="notifications-earlier">
              <Text variant="micro" style={styles.groupLabel}>
                EARLIER
              </Text>
              {earlier.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  now={now}
                  onPress={() => (n.read ? undefined : markRead.mutate(n.id))}
                  testID={`notification-${n.id}`}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    unreadBadge: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    group: {
      gap: spacing.md,
    },
    groupLabel: {
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
  });
}
