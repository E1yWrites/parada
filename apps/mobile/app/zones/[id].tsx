import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  AvailabilityBadge,
  Button,
  Card,
  CapacityBar,
  ErrorState,
  LoadingState,
  Metric,
  NavigateButton,
  Screen,
  Text,
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
      ) : zoneData ? (
        <>
          <Text variant="mono" color={colors.muted}>
            {zoneData.code}
          </Text>
          <Card testID="zone-detail-card">
            <AvailabilityBadge status={zoneData.availability} testID="zone-detail-availability" />
            <CapacityBar
              occupied={zoneData.occupiedCount}
              capacity={zoneData.capacity}
              color={colors.warning}
              testID="zone-detail-occupancy"
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Metric label="Free" value={String(zoneData.availableCount)} accent={colors.warning} icon="car-outline" />
              <Metric label="Capacity" value={String(zoneData.capacity)} accent={colors.muted} icon="grid-outline" />
              <Metric label="Occupied" value={String(zoneData.occupiedCount)} accent={colors.muted} icon="lock-closed-outline" />
            </View>
          </Card>

          {zoneData.description ? (
            <Text variant="caption" color={colors.foreground} testID="zone-detail-description">
              {zoneData.description}
            </Text>
          ) : null}

          <NavigateButton
            destination={resolveEstablishmentDestination(establishment.data)}
            label="Navigate to parking"
            testID="zone-detail-navigate"
          />

          <Button
            variant="secondary"
            title="Reserve from Parking"
            onPress={() => router.push("/(tabs)/parking")}
            testID="zone-detail-reserve"
          />
        </>
      ) : null}
    </Screen>
  );
}
