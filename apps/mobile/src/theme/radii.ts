/**
 * PARADA corner geometry.
 *
 * Shape rule (locked, applies everywhere): chips, badges/stamps, the tab bar
 * and avatars are full-pill — small token elements read as pills. Buttons,
 * cards, panels and inputs are "cut" — three soft corners plus one sharp
 * corner (`cut`) on the top-right, echoing the logo's diagonal cut; the
 * primary action carries the same cut as the surfaces it sits on. Nothing
 * uses a plain uniform rounded rectangle; that shape is retired.
 */
export const radii = {
  /** Chips, tracks, plate chip. */
  sm: 10,
  /** Buttons, inputs' soft corners, vehicle chips. */
  md: 14,
  /** Standard cards' soft corners. */
  lg: 20,
  /** Hero / pass cards, sheets — soft corners. */
  xl: 28,
  /** The sharp corner on cards/panels/inputs (the "PARADA cut"). */
  cut: 3,
  /** Pills/badges/buttons/tab bar. */
  full: 999,
} as const;
