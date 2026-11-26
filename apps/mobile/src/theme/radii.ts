/**
 * PARADA "Clear" corner geometry: uniform, continuous rounded corners
 * (Apple-like). Pills for chips, badges, the tab bar and avatars; one radius
 * per surface size everywhere else. The old one-sharp-corner "cut" is
 * retired.
 */
export const radii = {
  /** Chips, tracks, plate chip. */
  sm: 10,
  /** Buttons, inputs, vehicle chips. */
  md: 16,
  /** Standard cards and grouped lists. */
  lg: 22,
  /** Hero cards, sheets. */
  xl: 30,
  /** Pills: chips, badges/stamps, tab bar, avatars, dots and tracks. Buttons use `md`. */
  full: 999,
} as const;
