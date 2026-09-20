"use client";

import { useEffect, useRef, useState } from "react";

type NumberTickerProps = {
  value: number;
  durationMs?: number;
  className?: string;
};

/**
 * Odometer-style settle animation for a live operational figure — adapted
 * from Calamansi UI's Number Ticker (odometer digit roll), reimplemented
 * dependency-free since only dashboard hero figures need it: a plain
 * requestAnimationFrame tween, no GSAP/motion. Settles toward the new value
 * instead of instantly jumping, so a live count change (a car entering, a
 * zone filling) reads as an event rather than a silent re-render. Skips the
 * tween entirely under Reduce Motion.
 */
export function NumberTicker({ value, durationMs = 650, className }: NumberTickerProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === fromRef.current) {
      return;
    }
    const reducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, durationMs]);

  return (
    <span className={`tabular-nums ${className ?? ""}`}>
      {/* Visible tween is a pure animation — hidden from assistive tech so
          intermediate frames are never read aloud. A screen reader should
          hear the real figure once it settles, not every in-between value. */}
      <span aria-hidden="true">{display.toLocaleString()}</span>
      <span className="sr-only" aria-live="polite">
        {value.toLocaleString()}
      </span>
    </span>
  );
}
