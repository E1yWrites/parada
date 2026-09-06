export const APP_NAME = "PARADA";

export const ZONE_OCCUPANCY_LOW_THRESHOLD = 0.2;

/**
 * Minimum OCR confidence [0..1] for a detected plate to be trusted as a
 * registered-vehicle identity. An explicit confidence below this threshold is
 * not used for identity; an absent confidence from a trusted source is treated
 * as reliable.
 */
export const DEFAULT_OCR_CONFIDENCE_THRESHOLD = 0.5;

export const DEFAULT_LIMIT = 20;

export const DEFAULT_PARKING_FEE = {
  baseFee: 20,
  baseDurationHours: 2,
  additionalFeePerHour: 10,
} as const;

export const DEFAULT_RESERVATION_WINDOW_MINUTES = 15;

export const DEFAULT_GUEST_POLICY = {
  policy: "PRIMARY_ZONE" as const,
  primaryZoneId: null,
} as const;
