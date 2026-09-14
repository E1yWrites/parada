import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  Avatar,
  CurrentParkingState,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  ParkingRecommendation,
  ReservationPanel,
  Screen,
  SectionHeader,
  ZoneAssignmentPanel,
  ZoneCard,
} from "@/src/components";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { activeAssignmentFrom } from "@/lib/assignment";
import { currentReservationFrom } from "@/lib/current";
import { resolveEstablishmentDestination } from "@/lib/navigation";
import { queryKeys } from "@/lib/query";
import { useNow } from "@/src/hooks/useNow";
import { useSessionUser } from "@/src/providers/SessionProvider";
import { spacing } from "@/src/theme";

export default function ParkingScreen() {
  const router = useRouter();
  const user = useSessionUser();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const zones = useQuery({
    queryKey: queryKeys.zones,
    queryFn: api.zones,
    refetchInterval: 30_000,
  });
  const { width } = useWindowDimensions();
  const wide = width >= 520;
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
  const establishment = useQuery({
    queryKey: queryKeys.establishment,
    queryFn: api.establishment,
  });
  const notifications = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications });

  const activeSession = active.data ?? null;
  const now = useNow(30_000, activeSession !== null);
  const refreshing = zones.isFetching || active.isFetching;
  const refresh = () => {
    void zones.refetch();
    void active.refetch();
    void assignmentList.refetch();
    void reservationList.refetch();
    void establishment.refetch();
  };

  const selectedZone = zones.data?.find((zone) => zone.id === selectedZoneId) ?? null;
  const assignment = activeAssignmentFrom(assignmentList.data);
  const reservation = currentReservationFrom(reservationList.data);
  const hasCurrentState = activeSession !== null || assignment !== null || reservation !== null;
  // The recommendation is a suggestion only: it never competes with an active
  // session, assignment, reservation, or with a current state that is still
  // loading/unknown (an active session may be hiding behind a failed query).
  const showRecommendation =
    active.status === "success" &&
    !hasCurrentState &&
    assignmentList.status === "success" &&
    reservationList.status === "success";
  const statePending =
    activeSession === null &&
    (assignmentList.status === "pending" || reservationList.status === "pending");

  return (
    <Screen
      title="Parking"
      subtitle="Live zone availability from the gate cameras"
      leading={<Avatar name={user?.name} testID="parking-avatar" />}
      right={
        <IconButton
          icon="notifications-outline"
          accessibilityLabel="Notifications"
          badge={notifications.data?.unreadCount}
          onPress={() => router.push("/notifications")}
          testID="parking-notifications"
        />
      }
      refreshing={refreshing}
      onRefresh={refresh}
      testID="parking-screen">
      <CurrentParkingState
        session={activeSession}
        assignment={assignment}
        reservation={reservation}
        destination={resolveEstablishmentDestination(establishment.data)}
        destinationReady={establishment.status === "success"}
        now={now}
        activePending={active.isPending}
        activeError={active.isError}
        activeErrorMessage={
          active.error instanceof ApiError ? active.error.message : "Couldn't load your active session."
        }
        statePending={statePending}
        assignmentError={assignmentList.isError}
        reservationError={reservationList.isError}
        onRetry={refresh}
      />
      {showRecommendation ? <ParkingRecommendation /> : null}
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
          illustration="zones"
          title="No zones yet"
          description="There are no parking zones configured."
          testID="zones-empty"
        />
      ) : (
        <View style={styles.grid} testID="zones-grid">
          {(zones.data ?? []).map((zone: PublicZone) => (
            <View key={zone.id} style={wide ? styles.colWide : styles.colNarrow}>
              <ZoneCard
                zone={zone}
                onPress={hasCurrentState ? null : () => setSelectedZoneId(zone.id)}
                selected={selectedZoneId === zone.id}
                testID={`zone-${zone.code}`}
              />
            </View>
          ))}
        </View>
      )}
      {activeSession ? null : <ZoneAssignmentPanel selectedZone={selectedZone} />}
      {activeSession ? null : <ReservationPanel selectedZone={selectedZone} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xl,
  },
  colWide: {
    width: "47%",
    flexGrow: 1,
  },
  colNarrow: {
    width: "100%",
  },
});