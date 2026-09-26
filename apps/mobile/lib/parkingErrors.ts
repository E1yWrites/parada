import { ApiError } from "@/lib/api/client";

export type ParkingAction = "assign" | "reserve";

const CONNECTION = "We couldn't connect to the parking service. Please try again.";

/**
 * One mapping from a failed assign/reserve request to what the driver reads.
 * Assignment and reservation used to each carry their own copy of this; the
 * zone is named so the message says which choice failed.
 */
export function parkingErrorMessage(error: unknown, action: ParkingAction, zoneName?: string): string {
  const zone = zoneName ?? "This zone";
  if (!(error instanceof ApiError)) {
    return action === "assign"
      ? "We couldn't assign this zone. Please try again."
      : "We couldn't make this reservation. Please try again.";
  }
  if (error.code === "NETWORK" || error.code === "TIMEOUT") {
    return CONNECTION;
  }
  if (action === "assign") {
    if (error.code === "CONFLICT") {
      const message = error.message.toLowerCase();
      if (message.includes("cannot accept assignments")) {
        return `${zone} can't take this car right now. Choose another zone.`;
      }
      if (message.includes("already has an active zone assignment")) {
        return "This car already has an assigned zone.";
      }
    }
    return error.message;
  }
  if (error.code === "CONFLICT") {
    // A reservation conflict is either capacity for that window or an
    // overlapping reservation for the same car — both are "not for that time".
    return `${zone} can't take this reservation for that time. Try another time or zone.`;
  }
  return "Something went wrong. Please try again.";
}
