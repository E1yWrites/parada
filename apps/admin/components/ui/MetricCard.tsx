import type { ReactNode } from "react";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  valueClass?: string;
  detail?: ReactNode;
  monotone?: boolean;
  accent?: "none" | "orange" | "gold" | "green" | "amber" | "red";
}

const ACCENTS: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  none: "text-white",
  orange: "text-orange",
  gold: "text-gold",
  green: "text-emerald-300",
  amber: "text-amber-300",
  red: "text-rose-300",
};

/**
 * Technical telemetry-style metric card used on the dashboard and zone views.
 * Values render in JetBrains Mono and are visually dominant without using
 * marketing-style hero typography.
 */
export function MetricCard({
  label,
  value,
  valueClass = "",
  detail,
  accent = "none",
}: MetricCardProps) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-x-0 -top-16 h-24 bg-gradient-to-b from-orange/[0.06] to-transparent" aria-hidden="true" />
      <p className="label-tech">{label}</p>
      <p className={`mt-2 font-mono text-[2.1rem] font-bold leading-none tracking-tight ${ACCENTS[accent]} ${valueClass}`}>
        {value}
      </p>
      {detail ? <p className="mt-2 text-xs uppercase tracking-wider text-muted">{detail}</p> : null}
    </div>
  );
}
