import { StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { SectionHeader } from "./SectionHeader";
import { ReservationCard } from "./ReservationCard";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";

/**
 * Status list for the driver's reservations — independent of which parking
 * action (assign/reserve) is currently selected above, so a live reservation
 * never disappears just because the driver switched to "Park now".
 * Cancellation is an explicit two-tap acknowledgement against
 * PATCH /reservations/:id/cancel.
 */
export function ReservationList() {
  const queryClient = useQueryClient();
  const reservations = useQuery({ queryKey: queryKeys.reservations, queryFn: api.reservations });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelReservation(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
      // Cancelling releases the zone's protected capacity, so the availability
      // the zones grid shows moved.
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
    },
  });

  return (
    <View style={styles.section} testID="reservation-list-section">
      <SectionHeader title="My reservations" caption="Status from the parking service" testID="reservations-header" />

      {reservations.isPending ? (
        <LoadingState label="Loading your reservations…" testID="reservations-loading" />
      ) : reservations.isError ? (
        <ErrorState
          message={
            reservations.error instanceof ApiError
              ? reservations.error.message
              : "Couldn't load your reservations."
          }
          onRetry={() => void reservations.refetch()}
          testID="reservations-error"
        />
      ) : reservations.data && reservations.data.length === 0 ? (
        <EmptyState
          compact
          illustration="reserve"
          title="No reservations yet"
          description="Switch to Reserve above to hold a spot for your arrival."
          testID="reservations-empty"
        />
      ) : (
        <View style={styles.list} testID="reservations-list">
          {(reservations.data ?? []).map((reservation) => {
            const isCancelling = cancel.variables === reservation.id && cancel.isPending;
            return (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                cancelling={isCancelling}
                onCancel={() => cancel.mutate(reservation.id)}
                testID={`reservation-${reservation.id}`}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.xl,
  },
});
