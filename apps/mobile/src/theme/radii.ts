/** PARADA corner radii — soft and rounded; larger surfaces get larger corners. */
export const radii = {
  /** Chips, tracks, plate chips. */
  sm: 12,
  /** Buttons, inputs, vehicle chips. */
  md: 16,
  /** Standard cards. */
  lg: 24,
  /** Hero / pass cards, sheets. */
  xl: 32,
  /** Pills/badges. */
  full: 999,
} as const;
