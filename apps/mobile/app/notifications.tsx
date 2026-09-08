import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, NotificationRow, Screen, Text } from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import type { NotificationResponse } from "@parada/types";
import { spacing } from "@/src/theme";

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
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });

  const now = useMemo(() => new Date(), []);
  const { today, earlier } = groupByDay(notifications.data?.notifications ?? [], now);

  return (
    <Screen
      back
      title="Notifications"
      refreshing={notifications.isFetching}
      onRefresh={() => void notifications.refetch()}
      testID="notifications-screen">
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
          icon="notifications-outline"
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

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  groupLabel: {
    marginBottom: spacing.xs,
  },
});
