export function normalizePlate(plate: string): string {
  return plate
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatPlateForDisplay(normalized: string): string {
  return normalized || "";
}
