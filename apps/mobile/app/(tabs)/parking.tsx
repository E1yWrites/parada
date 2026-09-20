import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Avatar,
  CurrentParkingState,
  IconButton,
  MascotCallout,
  ParkingRecommendation,
  Screen,
  VehicleSelectionProvider,
} from "@/src/components";
import { api, ApiError, avatarUrl } from "@/lib/api/client";
import type { ZoneAssignmentResponse } from "@parada/types";
import { activeAssignmentFrom } from "@/lib/assignment";
import { currentReservationFrom } from "@/lib/current";
import { resolveZoneDestination } from "@/lib/navigation";
import { queryKeys } from "@/lib/query";
import { useNow } from "@/src/hooks/useNow";
import { useSessionToken, useSessionUser } from "@/src/providers/SessionProvider";

/**
 * Home: current parking status only (session / assignment / reservation),
 * plus a recommendation when idle. The zone picker and park/reserve flow
 * live on the Park tab (Figma direction splits these two concerns).
 */
export default function ParkingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const sessionToken = useSessionToken();
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hey ${firstName}, let's find your spot.` : "Let's find your spot.";
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

  // Directions always target the zone's own admin-configured coordinates.
  const destinationFor = useCallback(
    (zoneId: string) => resolveZoneDestination(zones.data?.find((zone) => zone.id === zoneId) ?? null),
    [zones.data],
  );

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
    <VehicleSelectionProvider>
      <Screen
        title="Home"
        subtitle="Live zone availability from the gate cameras"
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
        <MascotCallout variant="home" text={greeting} size={100} testID="parking-greeting" />
        <CurrentParkingState
          session={activeSession}
          assignment={assignment}
          reservation={reservation}
          destinationFor={destinationFor}
          destinationReady={zones.status === "success"}
          onCancelAssignment={onCancelAssignment}
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
        {showRecommendation ? (
          <ParkingRecommendation destinationFor={destinationFor} destinationReady={zones.status === "success"} />
        ) : null}
      </Screen>
    </VehicleSelectionProvider>
  );
}
