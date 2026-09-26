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
 * Zone picker: choose a zone, then park now or reserve for later. Split out
 * of the former single "Parking" screen so Home can show current status
 * without also carrying the zone grid (Figma direction: separate Home/Park
 * tabs). Still gates zone selection and the action panel on the same current
 * parking state as before — that gating logic is unchanged, only relocated.
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
      <SectionHeader
        title="Zones"
        caption={
          zones.data && zones.data.length > 0
            ? `${zones.data.filter((z) => z.status === "ACTIVE" && z.availableCount > 0).length} of ${plural(zones.data.length, "zone")} open`
            : undefined
        }
        testID="zones-header"
      />
      {zones.isPending ? (
        <LoadingState label="Loading park availability…" testID="zones-loading" />
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
                testID={`zone-${zone.code}`}
              />
            </View>
          ))}
        </ScrollView>
      )}
      {activeSession ? null : (
        <View style={styles.parkingAction} testID="parking-action">
          <SectionHeader
            title="Park your vehicle"
            caption="Pick how you'd like to use the selected zone"
            testID="parking-action-header"
          />
          <View testID="parking-action-toggle">
            <SegmentedControl
              value={actionMode}
              onChange={(mode) => setActionMode(mode as "assign" | "reserve")}
              options={[
                {
                  value: "assign",
                  label: "Park now",
                  accessibilityLabel: "Park now: assign a vehicle to the selected zone",
                  testID: "parking-action-assign",
                },
                {
                  value: "reserve",
                  label: "Reserve for later",
                  accessibilityLabel: "Reserve the selected zone for later",
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
