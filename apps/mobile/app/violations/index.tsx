import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, Screen, ViolationCard } from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";

export default function ViolationsScreen() {
  const router = useRouter();
  const violations = useQuery({ queryKey: queryKeys.violations, queryFn: api.violations });

  return (
    <Screen
      back
      title="Violations"
      subtitle="Wrong-zone entries, fines and appeals for your plates"
      refreshing={violations.isFetching}
      onRefresh={() => void violations.refetch()}
      testID="violations-screen">
      {violations.isPending ? (
        <LoadingState label="Loading your violations…" testID="violations-loading" />
      ) : violations.isError ? (
        <ErrorState
          message={
            violations.error instanceof ApiError ? violations.error.message : "Couldn't load your violations."
          }
          onRetry={() => void violations.refetch()}
          testID="violations-error"
        />
      ) : violations.data && violations.data.length === 0 ? (
        <EmptyState
          illustration="shield"
          title="No violations"
          description="Wrong-zone entries and their fines will show up here."
          testID="violations-empty"
        />
      ) : (
        <View style={styles.list} testID="violations-list">
          {(violations.data ?? []).map((violation) => (
            <ViolationCard
              key={violation.id}
              violation={violation}
              onPress={() => router.push(`/violations/${violation.id}`)}
              testID={`violation-${violation.id}`}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xl,
  },
});
