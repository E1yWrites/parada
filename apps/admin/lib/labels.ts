/**
 * Human labels for backend enums shown to operators. Pages used to print raw
 * values (WRONG_ZONE, ENTRY, CAMERA, BIDIRECTIONAL); every enum an operator
 * reads goes through here. Unknown values fall back to a readable form rather
 * than the raw constant.
 */

export const EVENT_LABEL: Record<string, string> = {
  ENTRY: "Entry",
  EXIT: "Exit",
};

export const SOURCE_LABEL: Record<string, string> = {
  CAMERA: "Camera",
  SIMULATOR: "Simulator",
  MANUAL: "Manual",
};

export const GATE_LABEL: Record<string, string> = {
  ENTRY: "Entry",
  EXIT: "Exit",
  BIDIRECTIONAL: "Entry and exit",
};

export const VIOLATION_TYPE_LABEL: Record<string, string> = {
  WRONG_ZONE: "Wrong zone",
  OVERSTAY: "Overstay",
  UNAUTHORIZED: "Unauthorized",
  GATE_TAMPERING: "Gate tampering",
};

/** "WRONG_ZONE" -> "Wrong zone" for values no map covers yet. */
export function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelFor(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "—";
  return map[value] ?? humanize(value);
}
