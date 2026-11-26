"use client";

import type { RealtimeStatus } from "@/lib/realtime";
import { useRealtimeStatus } from "./providers/realtime-status";

const LABEL: Record<RealtimeStatus, string> = {
  CONNECTED: "Live",
  RECONNECTING: "Reconnecting…",
  DISCONNECTED: "Not live",
  ERROR: "Not live",
};

/**
 * Header connection state, bound to the real realtime stream. The green dot
 * and the word "Live" appear only while the stream is CONNECTED; any other
 * state says so plainly. Pages that show data add their own "Updated hh:mm".
 */
export function ConnectionIndicator() {
  const status = useRealtimeStatus();
  const connected = status === "CONNECTED";
  const reconnecting = status === "RECONNECTING";
  const tone = connected ? "bg-success-soft text-success" : reconnecting ? "bg-warning-soft text-warning" : "bg-card text-muted";
  return (
    <div
      role="status"
      className={`inline-flex h-7 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold ${tone}`}
      data-status={status}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {connected ? <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-current opacity-60" /> : null}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      <p className="whitespace-nowrap">{LABEL[status]}</p>
    </div>
  );
}
