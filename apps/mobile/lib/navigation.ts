import { Platform } from "react-native";
import { Linking } from "react-native";
import type { LocationCoordinates } from "./location";
import type { EstablishmentInfo } from "@/lib/api/client";

/**
 * Navigation launch (Phase 9.5). Builds platform-appropriate map/navigation
 * deep links from the device's real current location and a real destination
 * from application data, then opens them through the OS. Nothing is rendered
 * in-app and no route is computed locally — the platform's navigation app does
 * the work. Failures surface as a friendly error, never raw details.
 */

export type NavigationDestination = {
  /** Human-readable place label (shown by the map app). */
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Resolves the navigation destination from the establishment endpoint. Zones
 * have no coordinates, so the parking establishment is the target. Returns null
 * when the backend has not configured a destination yet — the app never invents
 * one.
 */
export function resolveEstablishmentDestination(
  info: EstablishmentInfo | null | undefined,
): NavigationDestination | null {
  const location = info?.location;
  if (!location) {
    return null;
  }
  return { label: location.address, latitude: location.latitude, longitude: location.longitude };
}

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