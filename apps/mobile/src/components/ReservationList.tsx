import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { SectionHeader } from "./SectionHeader";
import { ReservationCard } from "./ReservationCard";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import type { ReservationResponse } from "@parada/types";
import { spacing } from "@/src/theme";

/** Reservations that are over: they no longer keep a space. */
const PAST: ReadonlySet<ReservationResponse["status"]> = new Set(["EXPIRED", "CANCELLED"]);

/**
 * Past reservations for the History tab — read-only. A live reservation
 * (PENDING / CONFIRMED / ACTIVE) is shown once, on the Now tab, with its
 * Navigate and Cancel actions; it never appears here too.
 */
export function ReservationList() {
  const reservations = useQuery({ queryKey: queryKeys.reservations, queryFn: api.reservations });
  const past = (reservations.data ?? []).filter((reservation) => PAST.has(reservation.status));

  return (
    <View style={styles.section} testID="reservation-list-section">
      <SectionHeader title="Past reservations" testID="reservations-header" />

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
      ) : past.length === 0 ? (
        <EmptyState
          compact
          illustration="reserve"
          title="No past reservations"
          description="Expired and cancelled reservations appear here."
          testID="reservations-empty"
        />
      ) : (
        <View style={styles.list} testID="reservations-list">
          {past.map((reservation) => (
            <ReservationCard key={reservation.id} reservation={reservation} testID={`reservation-${reservation.id}`} />
          ))}
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
