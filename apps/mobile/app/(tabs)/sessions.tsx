import { useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActiveSessionBanner,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
  SessionCard,
  Text,
} from "@/src/components";
import { GradientMesh } from "@/src/components/GradientMesh";
import { api, ApiError, type SessionDto } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useNow } from "@/src/hooks/useNow";
import { colors, spacing, tabClearance } from "@/src/theme";

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
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
    <SafeAreaView edges={["top"]} style={styles.flex}>
      <GradientMesh />
      <FlatList
        data={history}
        keyExtractor={(session) => session.id}
        renderItem={({ item }) => <SessionCard session={item} testID={`session-${item.id}`} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabClearance(insets.bottom) }]}
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
    </SafeAreaView>
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
      <View style={styles.titleBlock}>
        <Text variant="hero">Sessions</Text>
        <Text variant="caption">Every gate entry and exit for your plates</Text>
      </View>
      {active ? <ActiveSessionBanner session={active} now={now} testID="active-session" /> : null}
      {isError ? null : isLoading ? (
        <Text variant="caption" testID="sessions-header-state">
          Loading…
        </Text>
      ) : (
        <SectionHeader title="History" caption={`${historyCount} completed`} testID="sessions-history" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: {
    paddingHorizontal: spacing.xl2,
    paddingTop: spacing.xl,
    gap: spacing.lg,
    flexGrow: 1,
  },
  separator: { height: spacing.lg },
  header: {
    gap: spacing.xl2,
    marginBottom: spacing.md,
  },
  titleBlock: {
    gap: spacing.xs,
  },
});