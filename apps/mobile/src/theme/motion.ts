import { Easing } from "react-native";

/**
 * PARADA motion grammar. One authored moment per surface (the pass card's
 * stamp landing, a chip being struck forward); everything else is a short
 * ease-out. Consumers must skip loops/springs under `usePrefersReducedMotion`.
 */
export const motion = {
  duration: {
    /** Press feedback, chip toggles. */
    fast: 120,
    /** Card reveals, stamp landing. */
    base: 220,
    /** Live pulse cycle. */
    slow: 1200,
  },
  easing: {
    out: Easing.out(Easing.cubic),
    inOut: Easing.inOut(Easing.ease),
  },
  /** Spring used for the stamp landing on the pass card. */
  spring: {
    friction: 6,
    tension: 120,
  },
  /** Bouncier spring for button and card press release — more overshoot than the stamp's landing. */
  springPlayful: {
    friction: 5,
    tension: 160,
  },
  /** Scale applied to pressed cards/buttons. */
  pressScale: 0.98,
} as const;
