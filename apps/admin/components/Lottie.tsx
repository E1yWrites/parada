"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export const BLINK_EVERY_MS = 4200;
export const BLINK_FOR_MS = 140;
/** Source canvas is 319 × 312 (cut from the owner's sheet, aligned on the cap). */
const ASPECT = 312 / 319;

/**
 * Lottie, PARADA's mascot — on the login brand panel only, never inside the
 * console. Decorative (the greeting beside her names her), not clickable, so
 * the keyboard path to the form is unchanged. Blinks and floats gently;
 * both stop when the OS asks for reduced motion.
 */
export function Lottie({ size = 168 }: { size?: number }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let open: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (interval || reduce?.matches) return;
      interval = setInterval(() => {
        setBlink(true);
        open = setTimeout(() => setBlink(false), BLINK_FOR_MS);
      }, BLINK_EVERY_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      if (open) clearTimeout(open);
      interval = undefined;
      setBlink(false);
    };
    const onChange = () => (reduce?.matches ? stop() : start());
    start();
    reduce?.addEventListener?.("change", onChange);
    return () => {
      reduce?.removeEventListener?.("change", onChange);
      stop();
    };
  }, []);

  const height = Math.round(size * ASPECT);
  // Both frames stay mounted; only one is visible, so a blink never waits on a decode.
  return (
    <div
      aria-hidden="true"
      data-testid="lottie"
      className="relative motion-safe:animate-lottie-float"
      style={{ width: size, height }}
    >
      {(["calm", "blink"] as const).map((frame) => (
        <Image
          key={frame}
          src={`/lottie/lottie-${frame}.webp`}
          alt=""
          width={size}
          height={height}
          priority={frame === "calm"}
          data-frame={frame}
          className={`absolute inset-0 ${(frame === "blink") === blink ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </div>
  );
}
