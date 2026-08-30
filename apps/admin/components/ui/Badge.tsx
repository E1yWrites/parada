import type { ReactNode } from "react";

type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

const AVAILABILITY_META: Record<
  Availability,
  { label: string; classes: string; dot: string }
> = {
  AVAILABLE: {
    label: "AVAILABLE",
    classes: "bg-green-100 text-green-800 border-green-200",
    dot: "bg-green-500",
  },
  LOW_AVAILABILITY: {
    label: "LOW AVAILABILITY",
    classes: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  FULL: {
    label: "FULL",
    classes: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
  },
  OFFLINE: {
    label: "OFFLINE / UNAVAILABLE",
    classes: "bg-slate-200 text-slate-700 border-slate-300",
    dot: "bg-slate-400",
  },
};

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  const meta = AVAILABILITY_META[availability] ?? AVAILABILITY_META.OFFLINE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.classes}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span
      className={
        online
          ? "inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800"
          : "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
      }
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-slate-400"}`}
      />
      {online ? "ONLINE" : "OFFLINE"}
    </span>
  );
}

export function ReadBadge({ read }: { read: boolean }) {
  return read ? (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      Read
    </span>
  ) : (
    <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
      Unread
    </span>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-green-100 text-green-800 border-green-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    red: "bg-red-100 text-red-800 border-red-200",
    brand: "bg-brand-50 text-brand-700 border-brand-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone] ?? tones.slate}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: string;
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
    brand: "text-brand-700",
  };
  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tones[tone] ?? tones.slate}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}
