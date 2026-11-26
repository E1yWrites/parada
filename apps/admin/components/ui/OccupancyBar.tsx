import type { CSSProperties } from "react";
import type { Availability } from "./Badge";

export type TickTone = "on" | "live" | "full" | "warn";

/**
 * Quantised meter: a fixed number of segments shows a percentage. The segment
 * count never equals a number of spaces, so it can't be read as per-slot
 * detection. Purely visual (`aria-hidden`): the row it sits in states the
 * value as text.
 */
export function TickMeter({ pct, tone = "on", ticks = 24 }: { pct: number; tone?: TickTone; ticks?: number }) {
  const lit = Math.round((Math.min(100, Math.max(0, pct)) / 100) * ticks);
  return (
    <div className="tick-meter" style={{ "--ticks": ticks } as CSSProperties} aria-hidden="true" data-lit={lit}>
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={`tick ${i < lit ? `tick-${tone}` : ""}`} />
      ))}
    </div>
  );
}

const TONE: Record<Availability, TickTone> = {
  AVAILABLE: "on",
  LOW_AVAILABILITY: "on",
  FULL: "full",
  OFFLINE: "on",
};

/**
 * Zone occupancy meter, toned by the backend's availability class (only FULL
 * changes colour; the badge beside it carries the other states). Shared by
 * the dashboard and the zones list.
 */
export function OccupancyBar({ pct, availability }: { pct: number; availability: Availability }) {
  return <TickMeter pct={pct} tone={TONE[availability]} />;
}
