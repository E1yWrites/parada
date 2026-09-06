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