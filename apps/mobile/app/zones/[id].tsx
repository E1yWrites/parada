import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  AvailabilityBadge,
  Button,
  CapacityBar,
  ErrorState,
  GlassCard,
  LoadingState,
  Metric,
  NavigateButton,
  PlateChip,
  Screen,
  Text,
  parkingStatusMeta,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { resolveEstablishmentDestination } from "@/lib/navigation";
import { colors, spacing } from "@/src/theme";

export default function ZoneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Shares the ["zones"] cache with the Parking tab: already warm when opened
  // from there, and `description` (used below for wayfinding) is only on the
  // list payload — the single-zone /occupancy endpoint omits it.
  const zones = useQuery({ queryKey: queryKeys.zones, queryFn: api.zones, refetchInterval: 30_000 });
  const establishment = useQuery({ queryKey: queryKeys.establishment, queryFn: api.establishment });
  const zoneData = zones.data?.find((z) => z.id === id) ?? null;
  const status = zoneData ? parkingStatusMeta(zoneData.availability) : null;
  const isFull = zoneData ? zoneData.availableCount <= 0 : false;

  return (
    <Screen
      back
      title={zoneData?.name ?? "Zone"}
      refreshing={zones.isFetching}
      onRefresh={() => void zones.refetch()}
      testID="zone-detail-screen">
      {zones.isPending ? (
        <LoadingState label="Loading zone…" testID="zone-detail-loading" />
      ) : zones.isError ? (
        <ErrorState
          message={zones.error instanceof ApiError ? zones.error.message : "Couldn't load this zone."}
          onRetry={() => void zones.refetch()}
          testID="zone-detail-error"
        />
      ) : zoneData && status ? (
        <>
          <GlassCard wash={status.color} style={styles.hero} testID="zone-detail-card">
            <View style={styles.headerRow}>
              <PlateChip value={zoneData.code} />
              <AvailabilityBadge status={zoneData.availability} testID="zone-detail-availability" />
            </View>
            <View style={styles.countRow}>
              <Metric
                label="Free"
                value={String(zoneData.availableCount)}
                accent={isFull ? colors.danger : status.color === colors.muted ? colors.foreground : status.color}
                size="lg"
              />
              <View style={styles.sideMetrics}>
                <Metric label="Capacity" value={String(zoneData.capacity)} />
                <Metric label="Occupied" value={String(zoneData.occupiedCount)} />
              </View>
            </View>
            <CapacityBar
              occupied={zoneData.occupiedCount}
              capacity={zoneData.capacity}
              color={status.color}
              testID="zone-detail-occupancy"
            />
            <NavigateButton
              destination={resolveEstablishmentDestination(establishment.data)}
              label="Navigate to parking"
              primary
              testID="zone-detail-navigate"
            />
          </GlassCard>

          {zoneData.description ? (
            <View style={styles.description}>
              <Text variant="section">Finding the zone</Text>
              <Text variant="body" color={colors.muted} testID="zone-detail-description">
                {zoneData.description}
              </Text>
            </View>
          ) : null}

          <Button
            variant="secondary"
            title="Reserve from Parking"
            onPress={() => router.push("/(tabs)/parking")}
            testID="zone-detail-reserve"
          />
          <Text variant="caption" align="center">
            Counts update every 30 seconds from the gate cameras.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.xl2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  sideMetrics: {
    flexDirection: "row",
    gap: spacing.xl2,
    paddingBottom: spacing.sm,
  },
  description: {
    gap: spacing.md,
  },
});
