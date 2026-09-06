import type { ReactNode } from "react";
import { CheckCircle2, Circle, OctagonAlert, Signal, CircleDot, XCircle, Clock, Armchair, TriangleAlert, CircleOff } from "lucide-react";

export type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

export const AVAILABILITY_META: Record<
  Availability,
  { label: string; className: string; dotClass: string }
> = {
  AVAILABLE: {
    label: "Available",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  LOW_AVAILABILITY: {
    label: "Low Availability",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  FULL: {
    label: "Full",
    className: "border-brand/25 bg-brand-soft text-brand",
    dotClass: "bg-brand",
  },
  OFFLINE: {
    label: "Offline",
    className: "border-line bg-white text-charcoal",
    dotClass: "bg-muted",
  },
};

export function AvailabilityBadge({ value }: { value: Availability }) {
  const meta = AVAILABILITY_META[value];
  return (
    <span className={`status-pill ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function OnlineBadge({ online }: { online: boolean }) {
  return online ? (
    <span className="status-pill gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700">
      <Signal className="h-3.5 w-3.5" aria-hidden="true" />
      Online
    </span>
  ) : (
    <span className="status-pill gap-1.5 border-line bg-white text-muted">
      <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />
      Offline
    </span>
  );
}

export function ReadBadge({ read }: { read: boolean }) {
  return read ? (
    <span className="status-pill border-line bg-white text-muted">
      <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
      Read
    </span>
  ) : (
    <span className="status-pill gap-1.5 border-brand/25 bg-brand-soft text-brand">
      <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse-dot" aria-hidden="true" />
      Unread
    </span>
  );
}

export type Tone = "neutral" | "success" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-white text-muted",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-brand/25 bg-brand-soft text-brand",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`status-pill ${TONES[tone]} ${className}`}>{children}</span>
  );
}

type SessionStatus = "ACTIVE" | "COMPLETED";

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return status === "ACTIVE" ? (
    <Pill tone="info" className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse-dot" aria-hidden="true" />
      Active
    </Pill>
  ) : (
    <Pill tone="neutral" className="gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Completed
    </Pill>
  );
}

export function ResolvedBadge({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <Pill tone="success" className="gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Resolved
    </Pill>
  ) : (
    <Pill tone="danger" className="gap-1.5">
      <OctagonAlert className="h-3.5 w-3.5" aria-hidden="true" />
      Open
    </Pill>
  );
}

export const ANOMALY_LABEL: Record<string, string> = {
  UNREGISTERED_PLATE: "Unknown Plate",
  LOW_CONFIDENCE_PLATE: "Low Confidence Plate",
  EXIT_WITHOUT_ACTIVE_SESSION: "Exit Without Session",
  DUPLICATE_SESSION: "Duplicate Session",
  GUEST_DENIED: "Guest Admission Denied",
  GUEST_ADMITTED: "Guest Admitted",
  GUEST_ADMIN_OVERRIDE: "Guest Admin Override",
  GUEST_EXIT_WITHOUT_SESSION: "Guest Exit Without Session",
  GUEST_EXIT_WRONG_ZONE: "Guest Exit Wrong Zone",
  WRONG_ZONE_WARNING: "Wrong Zone Warning",
};

export function AnomalyTypeBadge({ type }: { type: string }) {
  let tone: Tone = "danger";
  let Icon: typeof Circle = Circle;
  if (type === "LOW_CONFIDENCE_PLATE") {
    tone = "warn";
    Icon = TriangleAlert;
  } else if (type === "DUPLICATE_SESSION") {
    tone = "info";
    Icon = Clock;
  } else if (type === "UNREGISTERED_PLATE" || type === "GUEST_DENIED") {
    tone = "danger";
    Icon = Armchair;
  } else if (type === "GUEST_ADMITTED" || type === "GUEST_ADMIN_OVERRIDE") {
    tone = "success";
    Icon = CheckCircle2;
  } else if (type === "WRONG_ZONE_WARNING" || type === "GUEST_EXIT_WRONG_ZONE") {
    tone = "warn";
    Icon = TriangleAlert;
  } else {
    tone = "danger";
    Icon = OctagonAlert;
  }
  return (
    <Pill tone={tone} className="gap-1.5">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {ANOMALY_LABEL[type] ?? type}
    </Pill>
  );
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <p className="label-tech">{label}</p>
      <p className="mt-2 font-display text-[2rem] font-black leading-none tracking-tight text-charcoal">
        {value}
      </p>
      {detail ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{detail}</p> : null}
    </div>
  );
}