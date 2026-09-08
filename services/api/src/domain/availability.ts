import { ZONE_OCCUPANCY_LOW_THRESHOLD } from "@parada/config";

export type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

/**
 * Derives the availability classification for a zone from its authoritative
 * occupancy state. OFFLINE for inactive zones; otherwise derived from how full
 * the zone is relative to its capacity.
 */
export function availabilityOf(
  occupiedCount: number,
  capacity: number,
  zoneStatus: "ACTIVE" | "INACTIVE"
): Availability {
  if (zoneStatus !== "ACTIVE") return "OFFLINE";
  if (capacity <= 0) return "AVAILABLE";
  if (occupiedCount >= capacity) return "FULL";
  const availableFraction = (capacity - occupiedCount) / capacity;
  if (availableFraction <= ZONE_OCCUPANCY_LOW_THRESHOLD) return "LOW_AVAILABILITY";
  return "AVAILABLE";
}