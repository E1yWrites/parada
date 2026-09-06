import * as Location from "expo-location";

/**
 * Navigation-only device-location helper (Phase 9.5).
 *
 * GPS is used strictly for navigating to the parking establishment. It never
 * feeds parking/occupancy/session logic and nothing here is persisted or sent
 * to the backend. There is no background tracking, no geofencing and no
 * watch-based location stream — the caller requests the current position once.
 */

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type LocationErrorKind = "denied" | "unavailable" | "timeout" | "unknown";

/** User-facing, non-technical location failure. Never carries native details. */
export class LocationError extends Error {
  readonly kind: LocationErrorKind;

  constructor(kind: LocationErrorKind, message: string) {
    super(message);
    this.name = "LocationError";
    this.kind = kind;
  }
}

export type LocationPermissionState = {
  /** True when the OS granted (or already holds) foreground location access. */
  granted: boolean;
  /** False after the OS has permanently denied and further prompts are ignored. */
  canAskAgain: boolean;
};

/**
 * Requests foreground location permission exactly once per call. The OS decides
 * how often it re-prompts; this module never loops on its own.
 */
export async function requestLocationPermission(): Promise<LocationPermissionState> {
  let result: Location.PermissionResponse;
  try {
    result = await Location.requestForegroundPermissionsAsync();
  } catch {
    // The permission prompt itself failed on this platform/device.
    return { granted: false, canAskAgain: true };
  }
  return { granted: result.granted, canAskAgain: result.canAskAgain };
}

/**
 * Fetches the device's current position. Throws a friendly `LocationError`;
 * the raw expo-location error is never surfaced.
 */
export async function getCurrentLocation(): Promise<LocationCoordinates> {
  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch (err) {
    throw toLocationError(err);
  }
  const { latitude, longitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new LocationError("unavailable", "We couldn't determine your location.");
  }
  return { latitude, longitude };
}

function toLocationError(err: unknown): LocationError {
  if (err instanceof LocationError) {
    return err;
  }
  // expo-location position errors are objects with a `code`; 1 = permission
  // denied, 2 = location services unavailable. We only surface the friendly
  // category, never the raw payload.
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: number }).code : null;
  if (code === 1) {
    return new LocationError("denied", "Location permission is required for navigation.");
  }
  if (code === 2) {
    return new LocationError("unavailable", "We couldn't determine your location.");
  }
  if (typeof code === "number" && code < 0) {
    return new LocationError("timeout", "We couldn't determine your location.");
  }
  return new LocationError("unknown", "We couldn't determine your location.");
}