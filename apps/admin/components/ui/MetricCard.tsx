import type { ReactNode } from "react";
import { TickMeter, type TickTone } from "./OccupancyBar";

/**
 * Facility strip: several figures on one panel, separated by seams instead of
 * a grid of same-size cards. Pass `MetricCard`s as children — the one figure
 * component in the console (StatCard and the dashboard StatPanel are gone).
 */
export function FacilityStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="card grid grid-cols-2 divide-y divide-line sm:divide-y-0 sm:divide-x lg:grid-cols-4"
    >
      {children}
    </div>
  );
}

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: "none" | "red" | "green" | "amber" | "info";
  /** Optional tick meter under the figure; `live` paints it orange (live data). */
  meter?: { pct: number; tone?: TickTone; ticks?: number };
}

const ACCENTS: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  none: "text-charcoal",
  red: "text-danger",
  green: "text-success",
  amber: "text-warning",
  info: "text-brand-ink",
};

/** One figure inside a `FacilityStrip`. */
export function MetricCard({ label, value, detail, accent = "none", meter }: MetricCardProps) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={`mt-1.5 text-3xl font-semibold leading-none tracking-[-0.025em] ${ACCENTS[accent]}`}>
        {value}
      </p>
      {meter ? (
        <div className="mt-3.5">
          <TickMeter pct={meter.pct} tone={meter.tone} ticks={meter.ticks} />
        </div>
      ) : null}
      {detail ? <p className="mt-2 break-words text-xs font-medium text-muted">{detail}</p> : null}
    </div>
  );
}
