import { useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  ActiveSessionBanner,
  EmptyState,
  ErrorState,
  LoadingState,
  MascotCallout,
  Screen,
  SectionHeader,
  SessionCard,
} from "@/src/components";
import { api, ApiError, type SessionDto } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useNow } from "@/src/hooks/useNow";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

export default function SessionsScreen() {
  const colors = useColors();
  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: api.sessions,
    refetchInterval: 30_000,
  });

  const all: SessionDto[] = sessions.data ?? [];
  const active = all.find((s) => s.status === "ACTIVE") ?? null;
  const history = all.filter((s) => s.status === "COMPLETED");
  const now = useNow(30_000, active !== null);
  const refreshing = sessions.isFetching;
  const refresh = () => void sessions.refetch();

  return (
    <Screen
      scroll={false}
      title="Sessions"
      subtitle="Every gate entry and exit for your plates"
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
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <Header
            isLoading={sessions.isPending}
            isError={sessions.isError}
            active={active}
            now={now}
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
              title="No parking sessions"
              description="Your parking history will appear here."
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
  active,
  now,
  historyCount,
}: {
  isLoading: boolean;
  isError: boolean;
  active: SessionDto | null;
  now: Date;
  historyCount: number;
}) {
  return (
    <View style={styles.header}>
      {active ? <ActiveSessionBanner session={active} now={now} testID="active-session" /> : null}
      {/* The list below already renders its own LoadingState; a second bare
          "Loading…" above it read like leftover scaffolding. */}
      {isError || isLoading ? null : (
        <>
          {/* Skip the callout when actively parked — the banner above already
              carries its own mascot accent; two at once reads cluttered. */}
          {active ? null : (
            <MascotCallout
              variant="history"
              text={
                historyCount > 0
                  ? `${historyCount} completed ${historyCount === 1 ? "trip" : "trips"} logged!`
                  : "Your parking journey starts here."
              }
              testID="sessions-greeting"
            />
          )}
          <SectionHeader title="History" caption={`${historyCount} completed`} testID="sessions-history" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: spacing.lg,
    flexGrow: 1,
  },
  separator: { height: spacing.lg },
  header: {
    gap: spacing.xl2,
    marginBottom: spacing.md,
  },
});
