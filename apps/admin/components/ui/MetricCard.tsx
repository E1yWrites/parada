import type { ReactNode } from "react";

/**
 * Facility strip: several figures on one panel, separated by seams instead of
 * a grid of same-size cards. Pass `StatCard`s (or any figure) as children.
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
}

const ACCENTS: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  none: "text-charcoal",
  red: "text-danger",
  green: "text-success",
  amber: "text-warning",
  info: "text-brand-ink",
};

/** One figure inside a `FacilityStrip`. */
export function MetricCard({ label, value, detail, accent = "none" }: MetricCardProps) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl font-black leading-none tracking-tight ${ACCENTS[accent]}`}>
        {value}
      </p>
      {detail ? <p className="mt-1.5 truncate text-xs font-semibold text-muted">{detail}</p> : null}
    </div>
  );
}
