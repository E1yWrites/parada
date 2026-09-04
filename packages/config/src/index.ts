export const APP_NAME = "PARADA";

export const ZONE_OCCUPANCY_LOW_THRESHOLD = 0.2;

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
  maxDurationHours: 8,
  allowWhenFull: false,
} as const;
