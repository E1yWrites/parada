import type { ReactNode } from "react";
import { CheckCircle2, Circle, OctagonAlert, Signal, CircleDot, XCircle, Clock, Armchair, TriangleAlert } from "lucide-react";

export type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

export const AVAILABILITY_META: Record<
  Availability,
  { label: string; className: string; dotClass: string }
> = {
  AVAILABLE: {
    label: "Available",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    dotClass: "bg-emerald-400",
  },
  LOW_AVAILABILITY: {
    label: "Low Availability",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    dotClass: "bg-amber-400",
  },
  FULL: {
    label: "Full",
    className: "border-[#EA580C]/40 bg-[#EA580C]/10 text-orange",
    dotClass: "bg-orange",
  },
  OFFLINE: {
    label: "Offline",
    className: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    dotClass: "bg-rose-400",
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
    <span className="status-pill border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
      <Signal className="h-3 w-3" aria-hidden="true" />
      Online
    </span>
  ) : (
    <span className="status-pill border-rose-400/30 bg-rose-400/10 text-rose-300">
      <XCircle className="h-3 w-3" aria-hidden="true" />
      Offline
    </span>
  );
}

export function ReadBadge({ read }: { read: boolean }) {
  return read ? (
    <span className="status-pill border-white/10 bg-white/[0.03] text-muted">
      <CircleDot className="h-3 w-3" aria-hidden="true" />
      Read
    </span>
  ) : (
    <span className="status-pill border-[#F7931A]/40 bg-[#EA580C]/10 text-orange">
      <span className="h-1.5 w-1.5 rounded-full bg-orange animate-pulse-dot" aria-hidden="true" />
      Unread
    </span>
  );
}

export type Tone = "neutral" | "success" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.03] text-muted",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  danger: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  info: "border-sky-400/30 bg-sky-400/10 text-sky-300",
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
      <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse-dot" aria-hidden="true" />
      Active
    </Pill>
  ) : (
    <Pill tone="neutral">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Completed
    </Pill>
  );
}

export function ResolvedBadge({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <Pill tone="success">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Resolved
    </Pill>
  ) : (
    <Pill tone="danger">
      <OctagonAlert className="h-3 w-3" aria-hidden="true" />
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
    <Pill tone={tone}>
      <Icon className="h-3 w-3" aria-hidden="true" />
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
      <p className="mt-2 font-mono text-[2rem] font-bold leading-none text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs uppercase tracking-wider text-muted">{detail}</p> : null}
    </div>
  );
}
