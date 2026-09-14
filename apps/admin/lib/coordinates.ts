/**
 * Zone navigation coordinates as typed by an operator. Both empty -> unset
 * (null pair); otherwise both must parse as finite numbers in WGS84 range.
 * The API re-validates; this only gives a readable message before the round
 * trip.
 */
export function parseCoordinates(
  latRaw: string,
  lngRaw: string
): { navigationLat: number | null; navigationLng: number | null } | { error: string } {
  const lat = latRaw.trim();
  const lng = lngRaw.trim();
  if (lat === "" && lng === "") return { navigationLat: null, navigationLng: null };
  if (lat === "" || lng === "") {
    return { error: "Enter both a navigation latitude and longitude, or leave both empty." };
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return { error: "Navigation latitude must be a number between -90 and 90." };
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return { error: "Navigation longitude must be a number between -180 and 180." };
  }
  return { navigationLat: latNum, navigationLng: lngNum };
}
