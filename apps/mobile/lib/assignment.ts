import type { Vehicle, ZoneAssignmentResponse } from "@parada/types";

/** A registered vehicle the backend will accept for assignment. */
export function isActiveVehicle(vehicle: Vehicle): boolean {
  return vehicle.status === "ACTIVE";
}

/** Newest ACTIVE assignment that has not yet expired, if any. */
export function activeAssignmentFrom(
  list: ZoneAssignmentResponse[] | undefined,
): ZoneAssignmentResponse | null {
  if (!Array.isArray(list)) {
    return null;
  }
  const now = Date.now();
  return (
    list.find(
      (assignment) =>
        assignment.status === "ACTIVE" &&
        (!assignment.expiresAt || new Date(assignment.expiresAt).getTime() > now),
    ) ?? null
  );
}

/**
 * Places a backend-confirmed assignment at the head of the assignments cache,
 * keeping any other history entries. The result of POST /assignments IS
 * authoritative backend state, so writing it straight into the canonical list
 * avoids a contradictory window where a freshly confirmed assignment is not yet
 * visible to the screen's current-state derivation (which reads that list).
 * A later invalidation refetches and replaces the cache with the full list.
 */
export function upsertAssignment(
  list: ZoneAssignmentResponse[] | undefined,
  confirmed: ZoneAssignmentResponse,
): ZoneAssignmentResponse[] {
  return [confirmed, ...(list ?? []).filter((assignment) => assignment.id !== confirmed.id)];
}

/**
 * What an assignment does NOT do, stated wherever the driver acts on one.
 * It keeps no space — only a reservation protects capacity
 * (services/api/src/domain/reservation.ts) — and at a camera gate, entering
 * another zone records a wrong-zone warning, then a fined violation
 * (occupancy.ts / violations.ts). The fine is establishment-configured, so no
 * amount is written here.
 */
export const ASSIGNMENT_TERMS =
  "No space is kept for you. Entering another zone gets a wrong-zone warning, then a fine.";
