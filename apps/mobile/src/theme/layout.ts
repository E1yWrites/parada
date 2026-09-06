/**
 * Floating navigation chrome — geometry shared by the tab bar and every
 * scroll surface so content can never hide behind the pill bar.
 */
export const layout = {
  /** Height of the floating pill tab bar. */
  FLOATING_TAB_BAR_HEIGHT: 64,
  /** Bottom margin of the pill above the safe-area inset. */
  FLOATING_TAB_BAR_MARGIN: 10,
  /** Horizontal margin of the pill. */
  FLOATING_TAB_BAR_SIDE: 16,
  /** Corner radius of the pill tab bar. */
  FLOATING_TAB_BAR_RADIUS: 32,
  /** Breathing room between the last content and the top of the pill. */
  TAB_CONTENT_GAP: 24,
} as const;

/**
 * Bottom padding for scroll content on tab screens. The pill floats at
 * `insets.bottom + MARGIN`, so a fixed constant hides content on devices with
 * a tall gesture inset — pass the real inset instead.
 */
export function tabClearance(bottomInset: number): number {
  return (
    bottomInset +
    layout.FLOATING_TAB_BAR_MARGIN +
    layout.FLOATING_TAB_BAR_HEIGHT +
    layout.TAB_CONTENT_GAP
  );
}