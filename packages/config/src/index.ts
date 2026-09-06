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

/**
 * Establishment-defined parking violations and their fines. These are the
 * house rules of the parking facility, not law enforcement. Seeded as the
 * starting set; admins edit them through the establishment settings.
 */
export const DEFAULT_VIOLATION_POLICIES = [
  { type: "WRONG_ZONE" as const, fineAmount: 100, description: "Parked in a zone other than the assigned one." },
  { type: "OVERSTAY" as const, fineAmount: 150, description: "Exceeded the permitted parking duration." },
  { type: "UNAUTHORIZED" as const, fineAmount: 200, description: "Parked without a valid session or reservation." },
  { type: "GATE_TAMPERING" as const, fineAmount: 500, description: "Interfered with gate or camera equipment." },
];

/** Wrong-zone entries tolerated (warned) before a violation is issued. */
export const WRONG_ZONE_WARNINGS_BEFORE_VIOLATION = 1;
