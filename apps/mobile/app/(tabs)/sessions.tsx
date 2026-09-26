import { useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ReservationList,
  Screen,
  SectionHeader,
  SessionCard,
} from "@/src/components";
import { api, ApiError, type SessionDto } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

/**
 * History: completed parking sessions and past reservations, read-only. What
 * is happening now (an active session, a live reservation or assigned zone)
 * and its actions live on the Now tab, so nothing here can be cancelled.
 */
export default function SessionsScreen() {
  const colors = useColors();
  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: api.sessions,
    refetchInterval: 30_000,
  });

  const all: SessionDto[] = sessions.data ?? [];
  const history = all.filter((s) => s.status === "COMPLETED");
  const refreshing = sessions.isFetching;
  const refresh = () => void sessions.refetch();

  return (
    <Screen
      scroll={false}
      title="History"
      subtitle="Completed parking sessions and past reservations"
      testID="sessions-screen">
      <FlatList
        data={history}
        keyExtractor={(session) => session.id}
        renderItem={({ item }) => <SessionCard session={item} testID={`session-${item.id}`} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <Header
            isLoading={sessions.isPending}
            isError={sessions.isError}
            historyCount={history.length}
          />
        }
        ListEmptyComponent={
          sessions.isPending ? (
            <LoadingState label="Loading sessions…" testID="sessions-loading" />
          ) : sessions.isError ? (
            <ErrorState
              message={sessions.error instanceof ApiError ? sessions.error.message : "Couldn't load your sessions."}
              onRetry={refresh}
              testID="sessions-error"
            />
          ) : (
            <EmptyState
              illustration="history"
              title="No completed sessions yet"
              description="A session starts when a gate camera records your entry."
              testID="sessions-empty"
            />
          )
        }
        testID="sessions-list"
      />
    </Screen>
  );
}

function Header({
  isLoading,
  isError,
  historyCount,
}: {
  isLoading: boolean;
  isError: boolean;
  historyCount: number;
}) {
  return (
    <View style={styles.header}>
      <ReservationList />
      {/* The list below already renders its own LoadingState; a second bare
          "Loading…" above it read like leftover scaffolding. */}
      {isError || isLoading ? null : (
        <SectionHeader title="Sessions" caption={`${historyCount} completed`} testID="sessions-history" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: spacing.lg,
    flexGrow: 1,
  },
  // SectionHeader carries its own 8pt top margin, so 16 + 8 lands the same
  // 24pt step between the banner, History header and first card.
  header: {
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
});
