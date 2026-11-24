/**
 * Zone navigation coordinates as typed by an operator. Both empty -> unset
 * (null pair); otherwise both must parse as finite numbers in WGS84 range.
 * The API re-validates; this only gives a readable message before the round
 * trip. `field` names the input to mark, using the API's field names.
 */
export function parseCoordinates(
  latRaw: string,
  lngRaw: string
):
  | { navigationLat: number | null; navigationLng: number | null }
  | { error: string; field: "navigationLat" | "navigationLng" } {
  const lat = latRaw.trim();
  const lng = lngRaw.trim();
  if (lat === "" && lng === "") return { navigationLat: null, navigationLng: null };
  if (lat === "" || lng === "") {
    return {
      error: "Enter both a navigation latitude and longitude, or leave both empty.",
      field: lat === "" ? "navigationLat" : "navigationLng",
    };
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return { error: "Navigation latitude must be a number between -90 and 90.", field: "navigationLat" };
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return { error: "Navigation longitude must be a number between -180 and 180.", field: "navigationLng" };
  }
  return { navigationLat: latNum, navigationLng: lngNum };
}

/** A point on the map picker. */
export type MapPoint = { lat: number; lng: number };

/**
 * The pin the map should show for the typed fields: a point only when both
 * parse as valid coordinates, otherwise null (no pin; the map keeps its view).
 */
export function pinFromFields(latRaw: string, lngRaw: string): MapPoint | null {
  const parsed = parseCoordinates(latRaw, lngRaw);
  if ("error" in parsed || parsed.navigationLat === null || parsed.navigationLng === null) return null;
  return { lat: parsed.navigationLat, lng: parsed.navigationLng };
}

/**
 * Text for a coordinate the operator picked on the map. Six decimals is about
 * 0.1 m, finer than map imagery can place a pin; trailing zeros are dropped.
 */
export function formatPickedCoordinate(value: number): string {
  return String(Number(value.toFixed(6)));
}

/**
 * Where the map opens when this zone has no pin yet: the first other zone that
 * already has one. PARADA stores no establishment-wide map centre, so with no
 * configured zone at all the picker shows the whole map instead of guessing.
 */
export function mapFallbackCenter(
  zones: ReadonlyArray<{ id: string; navigationLat: number | null; navigationLng: number | null }> | undefined,
  excludeId?: string
): MapPoint | null {
  const other = zones?.find((z) => z.id !== excludeId && z.navigationLat !== null && z.navigationLng !== null);
  return other ? { lat: other.navigationLat as number, lng: other.navigationLng as number } : null;
}
