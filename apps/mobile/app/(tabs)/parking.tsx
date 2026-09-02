import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import {
  ActiveSessionBanner,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
  ZoneCard,
} from "@/src/components";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useNow } from "@/src/hooks/useNow";
import { spacing } from "@/src/theme";

export default function ParkingScreen() {
  const zones = useQuery({
    queryKey: queryKeys.zones,
    queryFn: api.zones,
    refetchInterval: 30_000,
  });
  const active = useQuery({
    queryKey: queryKeys.activeSession,
    queryFn: api.activeSession,
    refetchInterval: 15_000,
  });

  const activeSession = active.data ?? null;
  const now = useNow(30_000, activeSession !== null);
  const refreshing = zones.isFetching || active.isFetching;
  const refresh = () => {
    void zones.refetch();
    void active.refetch();
  };

  return (
    <Screen
      title="Parking"
      eyebrow="Live availability"
      refreshing={refreshing}
      onRefresh={refresh}
      testID="parking-screen">
      {activeSession ? (
        <ActiveSessionBanner session={activeSession} now={now} testID="active-banner" />
      ) : null}
      <SectionHeader title="Zones" caption="Updated every 30 seconds" testID="zones-header" />
      {zones.isPending ? (
        <LoadingState label="Loading park availability…" testID="zones-loading" />
      ) : zones.isError ? (
        <ErrorState
          message={zones.error instanceof ApiError ? zones.error.message : "Couldn't load live availability."}
          onRetry={refresh}
          testID="zones-error"
        />
      ) : zones.data && zones.data.length === 0 ? (
        <EmptyState
          icon="map-outline"
          title="No zones yet"
          description="There are no parking zones configured."
          testID="zones-empty"
        />
      ) : (
        <View style={styles.grid} testID="zones-grid">
          {(zones.data ?? []).map((zone: PublicZone) => (
            <View key={zone.id} style={styles.col}>
              <ZoneCard zone={zone} testID={`zone-${zone.code}`} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xl,
  },
  col: {
    width: "47%",
    flexGrow: 1,
  },
});