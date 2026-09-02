/**
 * PARADA spacing scale — 4pt base grid.
 *
 * All paddings/margins/gaps resolve from these tokens so layout stays
 * consistent and touch targets never drift below ~44pt.
 */
export const spacing = {
  /** 2 */
  xs: 2,
  /** 4 */
  sm: 4,
  /** 8 */
  md: 8,
  /** 12 */
  lg: 12,
  /** 16 */
  xl: 16,
  /** 20 */
  xl2: 20,
  /** 24 */
  xl3: 24,
  /** 32 */
  xl4: 32,
  /** 40 */
  xl5: 40,
} as const;

/** Minimum touch target (PARADA accessibility baseline). */
export const touchTarget = 44 as const;