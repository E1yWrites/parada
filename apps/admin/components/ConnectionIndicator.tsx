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
  return (
    <div role="status" className="flex min-w-0 items-center gap-2.5" data-status={status}>
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        {connected ? (
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-success opacity-60" />
        ) : null}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-success" : "bg-muted"}`} />
      </span>
      <p className="truncate text-sm font-semibold text-muted">{LABEL[status]}</p>
    </div>
  );
}
