"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isRealtimeEvent, type RealtimeEventType } from "@parada/types";

export type RealtimeStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR";

/** Maps a realtime event type to the query keys it makes stale. Kept as a
 *  flat table rather than per-page logic so adding an event type later means
 *  editing exactly one place. */
const INVALIDATIONS: Record<RealtimeEventType, string[][]> = {
  ZONE_OCCUPANCY_UPDATED: [["zones"], ["dashboard"]],
  PARKING_SESSION_STARTED: [["sessions"], ["dashboard"]],
  PARKING_SESSION_COMPLETED: [["sessions"], ["dashboard"], ["analytics"]],
  RESERVATION_CREATED: [["reservations"]],
  RESERVATION_CANCELLED: [["reservations"]],
  ASSIGNMENT_CREATED: [["dashboard"]],
  VIOLATION_CREATED: [["violations"], ["dashboard"]],
  GUEST_ADMISSION_ISSUE: [["anomalies"], ["dashboard"]],
  NOTIFICATION_CREATED: [["notifications"]],
};

const CORE_QUERY_KEYS: string[][] = [["zones"], ["dashboard"], ["sessions"], ["reservations"], ["violations"], ["notifications"]];

/**
 * Opens the same-origin SSE relay (`/api/realtime` — see app/api/realtime/route.ts)
 * once per mount and keeps React Query's cache fresh by invalidating the
 * affected keys on each event, never by trusting the event payload directly.
 * A disconnect/error NEVER touches auth state or clears the cache — only an
 * explicit 401 from the existing REST calls does that (unchanged).
 */
export function useRealtime(): { status: RealtimeStatus } {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("DISCONNECTED");
  const everConnected = useRef(false);

  useEffect(() => {
    const source = new EventSource("/api/realtime");

    source.onopen = () => {
      if (everConnected.current) {
        // Reconnect, not first connect: we cannot know what was missed while
        // disconnected, so refetch authoritative state instead of trusting
        // event continuity.
        for (const key of CORE_QUERY_KEYS) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      everConnected.current = true;
      setStatus("CONNECTED");
    };

    source.onerror = () => {
      // A transport error is never an auth failure: never clear the query
      // cache and never touch the admin session cookie here.
      setStatus((prev) => (prev === "CONNECTED" ? "RECONNECTING" : "DISCONNECTED"));
    };

    for (const type of Object.keys(INVALIDATIONS) as RealtimeEventType[]) {
      source.addEventListener(type, (ev: MessageEvent) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!isRealtimeEvent(parsed)) return;
        for (const queryKey of INVALIDATIONS[parsed.type]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    return () => source.close();
  }, [queryClient]);

  return { status };
}
