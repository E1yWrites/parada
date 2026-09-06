import type { ReservationResponse } from "@parada/types";

/**
 * The user's current reservation — the newest one the backend still treats as
 * live (PENDING/CONFIRMED/ACTIVE). The backend flips window-expired
 * reservations to EXPIRED on every list/create, so excluding EXPIRED/CANCELLED
 * here matches backend semantics without re-deriving expiry. A reservation is
 * NEVER an assignment, a parking session, or occupancy.
 */
export function currentReservationFrom(
  list: ReservationResponse[] | undefined,
): ReservationResponse | null {
  if (!Array.isArray(list)) {
    return null;
  }
  return (
    list.find(
      (reservation) =>
        reservation.status === "CONFIRMED" ||
        reservation.status === "PENDING" ||
        reservation.status === "ACTIVE",
    ) ?? null
  );
}