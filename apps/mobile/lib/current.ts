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

/**
 * Places a backend-confirmed reservation at the head of the reservations cache,
 * keeping any other entries. The result of POST /reservations IS authoritative
 * backend state, so writing it into the canonical list lets the current-state
 * derivation (`currentReservationFrom`) see it immediately — no stale window
 * where the screen claims there is no current parking. A later invalidation
 * refetches and replaces the cache with the full list.
 */
export function upsertReservation(
  list: ReservationResponse[] | undefined,
  confirmed: ReservationResponse,
): ReservationResponse[] {
  return [confirmed, ...(list ?? []).filter((reservation) => reservation.id !== confirmed.id)];
}