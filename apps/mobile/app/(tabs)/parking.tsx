import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Avatar,
  CurrentParkingState,
  IconButton,
  Screen,
} from "@/src/components";
import { api, ApiError, avatarUrl } from "@/lib/api/client";
import type { ReservationResponse, ZoneAssignmentResponse } from "@parada/types";
import { activeAssignmentFrom } from "@/lib/assignment";
import { currentReservationFrom } from "@/lib/current";
import { resolveZoneDestination } from "@/lib/navigation";
import { queryKeys } from "@/lib/query";
import { useNow } from "@/src/hooks/useNow";
import { useConnectionLabel } from "@/src/providers/RealtimeStatusProvider";
import { useSessionToken, useSessionUser } from "@/src/providers/SessionProvider";

/**
 * Now: what is happening with this driver's parking right now (session /
 * reservation / assignment) and its actions. When nothing is current it says
 * so and offers "Find a zone"; choosing a zone and assigning/reserving (and
 * the "Least busy" tag) live on the Zones tab.
 */
export default function ParkingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const sessionToken = useSessionToken();
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
  const assignmentList = useQuery({
    queryKey: queryKeys.assignments,
    queryFn: api.assignments,
  });
  const reservationList = useQuery({
    queryKey: queryKeys.reservations,
    queryFn: api.reservations,
  });
  const notifications = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications });

  const activeSession = active.data ?? null;
  const connection = useConnectionLabel(active.dataUpdatedAt);
  const now = useNow(30_000, activeSession !== null);
  const refreshing = zones.isFetching || active.isFetching;
  const refresh = () => {
    void zones.refetch();
    void active.refetch();
    void assignmentList.refetch();
    void reservationList.refetch();
  };

  // Backend-enforced release of an accepted recommendation (PATCH
  // /assignments/:id/cancel). The response is authoritative: it goes into the
  // assignments cache, then everything derived from it is refetched.
  const cancelAssignment = useMutation({
    mutationFn: (assignmentId: string) => api.cancelAssignment(assignmentId),
    onSuccess: (cancelled) => {
      queryClient.setQueryData(queryKeys.assignments, (old: ZoneAssignmentResponse[] | undefined) =>
        (old ?? []).map((item) => (item.id === cancelled.id ? cancelled : item)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
    },
  });
  const onCancelAssignment = useCallback(
    async (assignmentId: string) => {
      await cancelAssignment.mutateAsync(assignmentId);
    },
    [cancelAssignment],
  );

  // PATCH /reservations/:id/cancel. The backend response replaces the cached
  // entry, so Now stops showing the reservation in the same commit; zones are
  // refetched because the released space changes availability.
  const cancelReservation = useMutation({
    mutationFn: (reservationId: string) => api.cancelReservation(reservationId),
    onSuccess: (cancelled) => {
      queryClient.setQueryData(queryKeys.reservations, (old: ReservationResponse[] | undefined) =>
        (old ?? []).map((item) => (item.id === cancelled.id ? cancelled : item)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
    },
  });
  const onCancelReservation = useCallback(
    async (reservationId: string) => {
      await cancelReservation.mutateAsync(reservationId);
    },
    [cancelReservation],
  );

  // Directions always target the zone's own admin-configured coordinates.
  const destinationFor = useCallback(
    (zoneId: string) => resolveZoneDestination(zones.data?.find((zone) => zone.id === zoneId) ?? null),
    [zones.data],
  );

  const assignment = activeAssignmentFrom(assignmentList.data);
  const reservation = currentReservationFrom(reservationList.data);
  const statePending =
    activeSession === null &&
    (assignmentList.status === "pending" || reservationList.status === "pending");

  return (
    <Screen
      title="Now"
      subtitle={connection}
      leading={<Avatar name={user?.name} uri={avatarUrl(user)} authToken={sessionToken} testID="parking-avatar" />}
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
        destinationFor={destinationFor}
        destinationReady={zones.status === "success"}
        onCancelAssignment={onCancelAssignment}
        onCancelReservation={onCancelReservation}
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
        onFindZone={() => router.push("/park")}
      />
    </Screen>
  );
}
