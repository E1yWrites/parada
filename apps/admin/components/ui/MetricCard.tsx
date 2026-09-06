import type { ReactNode } from "react";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  valueClass?: string;
  detail?: ReactNode;
  monotone?: boolean;
  accent?: "none" | "red" | "green" | "amber" | "info";
}

const ACCENTS: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  none: "text-charcoal",
  red: "text-brand",
  green: "text-emerald-600",
  amber: "text-amber-600",
  info: "text-sky-600",
};

export function MetricCard({
  label,
  value,
  valueClass = "",
  detail,
  monotone = false,
  accent = "none",
}: MetricCardProps) {
  return (
    <div className="card relative overflow-hidden p-5">
      <p className="label-tech">{label}</p>
      <p className={`mt-2 font-display text-[2.1rem] font-black leading-none tracking-[0.01em] ${ACCENTS[accent]} ${valueClass}`}>
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{detail}</p>
      ) : null}
    </div>
  );
}