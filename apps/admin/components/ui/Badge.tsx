import type { ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  OctagonAlert,
  CircleDot,
  Clock,
  Armchair,
  TriangleAlert,
  CircleOff,
  Ban,
  AlertCircle,
  Power,
} from "lucide-react";

export type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

export type Tone = "neutral" | "success" | "warn" | "danger" | "info";

/** Tinted pill fills: soft background, full-strength text. Never color alone — every pill carries a glyph or dot. */
const TONES: Record<Tone, string> = {
  neutral: "bg-raised text-muted",
  success: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-brand-soft text-brand-ink",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-muted",
  success: "bg-success",
  warn: "bg-warning",
  danger: "bg-danger",
  info: "bg-brand",
};

export const AVAILABILITY_META: Record<
  Availability,
  { label: string; tone: Tone; Icon: typeof Circle }
> = {
  AVAILABLE: { label: "Available", tone: "success", Icon: CheckCircle2 },
  LOW_AVAILABILITY: { label: "Few spaces", tone: "warn", Icon: AlertCircle },
  FULL: { label: "Full", tone: "danger", Icon: Ban },
  OFFLINE: { label: "Inactive", tone: "neutral", Icon: Power },
};

/** Fill color for occupancy bars, from the same availability family. */
export const AVAILABILITY_BAR: Record<Availability, string> = {
  AVAILABLE: "bg-success",
  LOW_AVAILABILITY: "bg-warning",
  FULL: "bg-danger",
  OFFLINE: "bg-muted",
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
  return <span className={`status-pill ${TONES[tone]} ${className}`}>{children}</span>;
}

/** Pill with a status dot; for states that have no natural glyph. */
export function DotPill({
  tone = "neutral",
  children,
  pulse = false,
}: {
  tone?: Tone;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <Pill tone={tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]} ${pulse ? "animate-pulse-dot" : ""}`} aria-hidden="true" />
      {children}
    </Pill>
  );
}

export function AvailabilityBadge({ value }: { value: Availability }) {
  const meta = AVAILABILITY_META[value];
  return (
    <Pill tone={meta.tone}>
      <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </Pill>
  );
}

/**
 * Camera on/off state as set by an admin (ONLINE/OFFLINE in the API is a
 * switch, services/api/src/domain/zoneConfig.ts). There is no heartbeat, so
 * this never claims a camera is "online" or healthy.
 */
export function CameraEnabledBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Pill tone="success">
      <Power className="h-3.5 w-3.5" aria-hidden="true" />
      Enabled
    </Pill>
  ) : (
    <Pill tone="neutral">
      <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />
      Disabled
    </Pill>
  );
}

export function ReadBadge({ read }: { read: boolean }) {
  return read ? (
    <Pill tone="neutral">
      <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
      Read
    </Pill>
  ) : (
    <DotPill tone="info" pulse>
      Unread
    </DotPill>
  );
}

type SessionStatus = "ACTIVE" | "COMPLETED";

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return status === "ACTIVE" ? (
    <DotPill tone="info" pulse>
      Active
    </DotPill>
  ) : (
    <Pill tone="neutral">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Completed
    </Pill>
  );
}

export function ResolvedBadge({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <Pill tone="success">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Resolved
    </Pill>
  ) : (
    <Pill tone="danger">
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
    <Pill tone={tone}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {ANOMALY_LABEL[type] ?? type}
    </Pill>
  );
}

/** Identifier chip for zone codes, plates and camera ids. */
export function PlateChip({ children, soft = false }: { children: ReactNode; soft?: boolean }) {
  return <span className={soft ? "plate-chip-soft" : "plate-chip"}>{children}</span>;
}

