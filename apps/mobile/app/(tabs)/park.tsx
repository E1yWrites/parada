import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ReservationPanel,
  Screen,
  SectionHeader,
  SegmentedControl,
  ZoneAssignmentPanel,
  ZoneCard,
} from "@/src/components";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { activeAssignmentFrom } from "@/lib/assignment";
import { currentReservationFrom } from "@/lib/current";
import { plural } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { useConnectionLabel } from "@/src/providers/RealtimeStatusProvider";
import { spacing } from "@/src/theme";

/** Tile width for the horizontal zone rail — wide enough for a 2-line zone
 *  name and the full capacity bar, narrow enough that 2+ tiles peek at once. */
const ZONE_TILE_WIDTH = 208;

/**
 * Zones: choose a zone, then either "Go to this zone" (an assignment — keeps
 * no space) or "Reserve a space" (a reservation — keeps one space for its
 * window). The backend's least-occupied zone is tagged "Least busy" in the
 * list. What the driver has already committed to lives on the Now tab; zone
 * selection is gated on it (no second plan while one is current).
 */
export default function ParkScreen() {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"assign" | "reserve">("assign");
  const zones = useQuery({
    queryKey: queryKeys.zones,
    queryFn: api.zones,
    refetchInterval: 30_000,
  });
  const connection = useConnectionLabel(zones.dataUpdatedAt);
  // Global least-occupied active zone (services/api/src/domain/zones.ts) —
  // not personal, so it is labelled "Least busy", never "recommended for you".
  const leastBusy = useQuery({
    queryKey: queryKeys.recommendation,
    queryFn: api.recommendedZone,
    refetchInterval: 30_000,
  });
  const leastBusyId = leastBusy.data?.recommendedZone?.id ?? null;
  const active = useQuery({
    queryKey: queryKeys.activeSession,
    queryFn: api.activeSession,
    refetchInterval: 15_000,
  });
  const assignmentList = useQuery({
    queryKey: queryKeys.assignments,
    queryFn: api.assignments,
  });
  const reservationList = useQuery({
    queryKey: queryKeys.reservations,
    queryFn: api.reservations,
  });

  const activeSession = active.data ?? null;
  const refreshing = zones.isFetching || active.isFetching;
  const refresh = () => {
    void zones.refetch();
    void active.refetch();
    void assignmentList.refetch();
    void reservationList.refetch();
  };

  const selectedZone = zones.data?.find((zone) => zone.id === selectedZoneId) ?? null;
  const assignment = activeAssignmentFrom(assignmentList.data);
  const reservation = currentReservationFrom(reservationList.data);
  const hasCurrentState = activeSession !== null || assignment !== null || reservation !== null;

  return (
    <Screen
      title="Zones"
      subtitle={connection}
      refreshing={refreshing}
      onRefresh={refresh}
      testID="park-screen">
      {zones.data && zones.data.length > 0 ? (
        <SectionHeader
          title={`${zones.data.filter((z) => z.status === "ACTIVE" && z.availableCount > 0).length} of ${plural(zones.data.length, "zone")} open`}
          testID="zones-header"
        />
      ) : null}
      {zones.isPending ? (
        <LoadingState label="Loading zones…" testID="zones-loading" />
      ) : zones.isError ? (
        <ErrorState
          message={zones.error instanceof ApiError ? zones.error.message : "Couldn't load zone availability."}
          onRetry={refresh}
          testID="zones-error"
        />
      ) : zones.data && zones.data.length === 0 ? (
        <EmptyState
          illustration="zones"
          title="No zones yet"
          description="There are no parking zones configured."
          testID="zones-empty"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={ZONE_TILE_WIDTH + spacing.lg}
          snapToAlignment="start"
          style={styles.railScroller}
          contentContainerStyle={styles.rail}
          testID="zones-grid">
          {(zones.data ?? []).map((zone: PublicZone) => (
            <View key={zone.id} style={styles.tile}>
              <ZoneCard
                zone={zone}
                onPress={hasCurrentState ? null : () => setSelectedZoneId(zone.id)}
                selected={selectedZoneId === zone.id}
                leastBusy={zone.id === leastBusyId}
                testID={`zone-${zone.code}`}
              />
            </View>
          ))}
        </ScrollView>
      )}
      {activeSession ? null : (
        <View style={styles.parkingAction} testID="parking-action">
          <View testID="parking-action-toggle">
            <SegmentedControl
              value={actionMode}
              onChange={(mode) => setActionMode(mode as "assign" | "reserve")}
              options={[
                {
                  value: "assign",
                  label: "Go to this zone",
                  accessibilityLabel: "Go to this zone: no space is kept",
                  testID: "parking-action-assign",
                },
                {
                  value: "reserve",
                  label: "Reserve a space",
                  accessibilityLabel: "Reserve a space: keeps one space from your arrival time",
                  testID: "parking-action-reserve",
                },
              ]}
            />
          </View>
          {actionMode === "assign" ? (
            <ZoneAssignmentPanel selectedZone={selectedZone} />
          ) : (
            <ReservationPanel selectedZone={selectedZone} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The bleed lives on the ScrollView's own frame (`style`), not its content
  // container — a negative margin on `contentContainerStyle` shifts where
  // content starts but never widens the scroll viewport itself, so a tile
  // meant to "peek" past Screen's padding was actually just clipped there.
  railScroller: {
    marginHorizontal: -spacing.xl2,
  },
  rail: {
    flexDirection: "row",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl2,
  },
  tile: {
    width: ZONE_TILE_WIDTH,
  },
  parkingAction: {
    gap: spacing.xl,
  },
});
