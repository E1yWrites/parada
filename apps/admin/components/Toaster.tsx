"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Ban, Scale, TriangleAlert, UserX, X, type LucideIcon } from "lucide-react";
import type { RealtimeEvent } from "@parada/types";
import { subscribeRealtimeEvents } from "@/lib/realtime";
import { VIOLATION_TYPE_LABEL, labelFor } from "@/lib/labels";

/** An event older than this never pops (a replay after a reconnect, say). */
export const STALE_AFTER_MS = 10 * 60 * 1000;
/** Info pop-ups hide after this long unless hovered or focused. */
export const INFO_HIDE_MS = 8000;
/** How many pop-ups show at once; the rest fold into "+N more". */
const MAX_VISIBLE = 3;

type Severity = "critical" | "info";

export interface Toast {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  icon: LucideIcon;
  tone: "danger" | "warning" | "brand";
  actions: { label: string; href: string }[];
}

/** Zone display name from whatever zone list the cache already holds. */
function zoneName(client: QueryClient, zoneId: string): string {
  const lists = [
    (client.getQueryData(["dashboard"]) as { zones?: { id: string; name: string }[] } | undefined)?.zones,
    client.getQueryData(["zones"]) as { id: string; name: string }[] | undefined,
  ];
  for (const list of lists) {
    const zone = Array.isArray(list) ? list.find((z) => z.id === zoneId) : undefined;
    if (zone) return zone.name;
  }
  return "A zone";
}

function humanize(reason: string | null): string {
  if (!reason) return "the guest policy denied it";
  return reason.toLowerCase().replace(/_/g, " ");
}

/**
 * Which realtime events interrupt the operator. Only things they can act on:
 * a full zone, a denied guest, a filling zone, an appeal, a new violation.
 * Entries, exits and occupancy changes never pop — they update figures in
 * place. Every text comes from the event payload or the cached zone list.
 */
export function toastFor(event: RealtimeEvent, client: QueryClient, now = Date.now()): Toast | null {
  if (now - new Date(event.occurredAt).getTime() > STALE_AFTER_MS) return null;
  const id = `seq-${event.seq}`;

  switch (event.type) {
    case "NOTIFICATION_CREATED": {
      const n = event.payload;
      if (n.targetRole !== "ADMIN") return null;
      const zone = zoneName(client, n.zoneId);
      if (n.type === "ZONE_FULL") {
        return {
          id, severity: "critical", tone: "danger", icon: Ban,
          title: `${zone} is full`, body: n.message,
          actions: [
            { label: "Open zone", href: `/zones/${n.zoneId}` },
            { label: "Guest admission", href: "/guest-admit" },
          ],
        };
      }
      if (n.type === "ZONE_LOW_AVAILABILITY") {
        return {
          id, severity: "info", tone: "warning", icon: TriangleAlert,
          title: `${zone} is filling up`, body: n.message,
          actions: [{ label: "Open zone", href: `/zones/${n.zoneId}` }],
        };
      }
      if (n.type === "VIOLATION_APPEAL_SUBMITTED") {
        return {
          id, severity: "info", tone: "brand", icon: Scale,
          title: "Appeal submitted", body: n.message,
          actions: [{ label: "Review appeal", href: "/appeals" }],
        };
      }
      return null;
    }
    case "GUEST_ADMISSION_ISSUE": {
      const g = event.payload;
      if (g.admitted) return null;
      // The same event reports an EXIT the backend could not match to a guest
      // session (GUEST_EXIT_*). That is not an entry denial and needs no admit.
      if (g.deniedReason?.startsWith("GUEST_EXIT")) {
        return {
          id, severity: "info", tone: "warning", icon: TriangleAlert,
          title: "Guest exit not matched",
          body: `${zoneName(client, g.zoneId)}: ${humanize(g.deniedReason)}. Occupancy was not released.`,
          actions: [{ label: "Open anomalies", href: "/anomalies" }],
        };
      }
      return {
        id, severity: "critical", tone: "danger", icon: UserX,
        title: "Guest entry denied",
        body: `${zoneName(client, g.zoneId)}: ${humanize(g.deniedReason)}.`,
        actions: [
          { label: "Guest admission", href: "/guest-admit" },
          { label: "Open zone", href: `/zones/${g.zoneId}` },
        ],
      };
    }
    case "VIOLATION_CREATED": {
      const v = event.payload;
      const parts = [
        v.vehicle?.plateNumber,
        labelFor(VIOLATION_TYPE_LABEL, v.violationType),
        `₱${v.fineAmount.toFixed(2)}`,
      ].filter(Boolean);
      return {
        id, severity: "info", tone: "warning", icon: TriangleAlert,
        title: "Violation issued", body: `${parts.join(" · ")} · ${v.zone.name}`,
        actions: [{ label: "Open violations", href: "/violations" }],
      };
    }
    default:
      return null;
  }
}

const TONE_CLASS: Record<Toast["tone"], string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  brand: "bg-brand-soft text-brand-ink",
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(INFO_HIDE_MS);
  const startedAt = useRef(0);
  const Icon = toast.icon;
  const critical = toast.severity === "critical";

  useEffect(() => {
    if (critical || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [critical, paused, onDismiss, toast.id]);

  return (
    <div
      role={critical ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      data-severity={toast.severity}
      className={`float-panel pointer-events-auto w-96 max-w-[calc(100vw-2rem)] overflow-hidden animate-fade-in ${
        critical ? "border-danger/45" : ""
      }`}
    >
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] gap-3 pl-3.5 pr-1.5 pt-3.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-control ${TONE_CLASS[toast.tone]}`} aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-charcoal">{toast.title}</p>
          <p className="mt-0.5 break-words text-sm text-muted">{toast.body}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="-mt-2 flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-charcoal focus-visible:outline-hidden focus-visible:shadow-focus"
          aria-label={`Dismiss: ${toast.title}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 px-3.5 pb-3.5 pl-[3.875rem] pt-3">
        {toast.actions.map((action, i) => (
          <Link
            key={action.href + action.label}
            href={action.href}
            onClick={() => onDismiss(toast.id)}
            className={critical && i === 0 ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {action.label}
          </Link>
        ))}
      </div>
      {critical ? null : (
        <div className="h-[3px] bg-raised" aria-hidden="true">
          <div
            className="h-full origin-left bg-muted"
            style={{
              animation: `toast-timer ${INFO_HIDE_MS}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Realtime pop-ups, top right under the header. Critical ones stay until
 * dismissed; info ones hide after 8s (paused while hovered or focused). The
 * same records stay in Notifications, so dismissing loses nothing.
 */
export function Toaster() {
  const client = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  useEffect(
    () =>
      subscribeRealtimeEvents((event) => {
        const toast = toastFor(event, client);
        if (toast) setToasts((all) => (all.some((t) => t.id === toast.id) ? all : [toast, ...all]));
      }),
    [client]
  );

  const visible = toasts.slice(0, MAX_VISIBLE);
  const hidden = toasts.length - visible.length;

  return (
    <div
      aria-label="Pop-up notifications"
      className="pointer-events-none fixed right-4 top-20 z-50 flex flex-col items-end gap-2.5"
    >
      {visible.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
      {hidden > 0 ? (
        <Link
          href="/notifications"
          onClick={() => setToasts(visible)}
          className="pointer-events-auto inline-flex min-h-[44px] items-center rounded-full border border-line bg-card px-4 text-xs font-semibold text-muted shadow-card-hover hover:text-charcoal focus-visible:outline-hidden focus-visible:shadow-focus"
        >
          +{hidden} more in notifications
        </Link>
      ) : null}
    </div>
  );
}
