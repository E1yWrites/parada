import { Platform } from "react-native";
import { Linking } from "react-native";
import type { LocationCoordinates } from "./location";

/**
 * Navigation launch (Phase 9.5). Builds platform-appropriate map/navigation
 * deep links from the device's real current location and a real destination
 * from application data, then opens them through the OS. Nothing is rendered
 * in-app and no route is computed locally — the platform's navigation app does
 * the work. Failures surface as a friendly error, never raw details.
 *
 * Destinations resolve per zone from the admin-configured coordinates. An
 * establishment-level destination was the earlier model and is gone: zones now
 * carry their own coordinates, so there is nothing to fall back to.
 */

export type NavigationDestination = {
  /** Human-readable place label (shown by the map app). */
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Resolves the navigation destination for one parking zone from its
 * admin-configured `navigationLat` / `navigationLng`. Returns null when the
 * zone has no coordinates yet — the app never searches by name, falls back to
 * the campus centre, or infers a point.
 */
export function resolveZoneDestination(
  zone: { name: string; navigationLat: number | null; navigationLng: number | null } | null | undefined,
): NavigationDestination | null {
  if (!zone) {
    return null;
  }
  const { navigationLat, navigationLng } = zone;
  if (
    typeof navigationLat !== "number" ||
    typeof navigationLng !== "number" ||
    !Number.isFinite(navigationLat) ||
    !Number.isFinite(navigationLng) ||
    navigationLat < -90 ||
    navigationLat > 90 ||
    navigationLng < -180 ||
    navigationLng > 180
  ) {
    return null;
  }
  return { label: zone.name, latitude: navigationLat, longitude: navigationLng };
}

/** Shown under a disabled Directions action when the zone has no coordinates. */
export const ZONE_NAVIGATION_UNCONFIGURED =
  "Navigation coordinates for this zone haven't been configured yet.";

export type PlatformName = "ios" | "android";

/** Primary turn-by-turn navigation deep link for the given platform. */
export function primaryNavigationUrl(
  current: LocationCoordinates,
  destination: NavigationDestination,
  platform: PlatformName,
): string {
  return platform === "ios"
    ? `maps://?saddr=${current.latitude},${current.longitude}&daddr=${destination.latitude},${destination.longitude}`
    : `google.navigation:q=${destination.latitude},${destination.longitude}&saddr=${current.latitude},${current.longitude}`;
}

/** Universal coordinate-based fallback exposed when the platform app is absent. */
export function fallbackNavigationUrl(
  _current: LocationCoordinates,
  destination: NavigationDestination,
): string {
  return `geo:${destination.latitude},${destination.longitude}?q=${destination.latitude},${destination.longitude}`;
}

export class NavigationUnavailableError extends Error {
  constructor(message = "Unable to open navigation. Please try again.") {
    super(message);
    this.name = "NavigationUnavailableError";
  }
}

/**
 * Opens the device's navigation app for the destination. Current coordinates
 * come from the real `getCurrentLocation()` result; the destination comes from
 * application data. Returns the opened URL. Throws `NavigationUnavailableError`
 * (friendly-only) when no scheme can be opened.
 */
export async function openNavigation(
  current: LocationCoordinates,
  destination: NavigationDestination,
  platform: PlatformName = Platform.OS as PlatformName,
): Promise<string> {
  const candidates = [
    primaryNavigationUrl(current, destination, platform),
    fallbackNavigationUrl(current, destination),
  ];
  for (const url of candidates) {
    let canOpen = false;
    try {
      canOpen = await Linking.canOpenURL(url);
    } catch {
      canOpen = false;
    }
    if (!canOpen) {
      continue;
    }
    try {
      await Linking.openURL(url);
      return url;
    } catch {
      continue;
    }
  }
  throw new NavigationUnavailableError();
}