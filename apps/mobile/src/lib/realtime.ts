import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import EventSource from "react-native-sse";
import { isRealtimeEvent, type RealtimeEventType } from "@parada/types";
import { getToken } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query";

export type RealtimeStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR";

const API_ROOT = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/+$/, "");

const INVALIDATIONS: Record<RealtimeEventType, (readonly unknown[])[]> = {
  ZONE_OCCUPANCY_UPDATED: [queryKeys.zones],
  PARKING_SESSION_STARTED: [queryKeys.activeSession, queryKeys.sessions],
  PARKING_SESSION_COMPLETED: [queryKeys.activeSession, queryKeys.sessions],
  RESERVATION_CREATED: [queryKeys.reservations],
  RESERVATION_CANCELLED: [queryKeys.reservations],
  ASSIGNMENT_CREATED: [queryKeys.assignments],
  VIOLATION_CREATED: [queryKeys.violations],
  GUEST_ADMISSION_ISSUE: [],
  NOTIFICATION_CREATED: [queryKeys.notifications],
};

const CORE_QUERY_KEYS: (readonly unknown[])[] = [
  queryKeys.zones,
  queryKeys.activeSession,
  queryKeys.assignments,
  queryKeys.reservations,
  queryKeys.notifications,
  queryKeys.violations,
];

/**
 * Direct-to-API SSE connection using the same bearer token every other mobile
 * request already sends (no proxy needed — unlike Admin, the token is not
 * httpOnly here). A disconnect/error NEVER calls notifyAuthInvalidated: only
 * an explicit 401 from the existing REST client does that (unchanged).
 */
export function useRealtime(): { status: RealtimeStatus } {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("DISCONNECTED");
  const everConnected = useRef(false);

  useEffect(() => {
    let source: EventSource<RealtimeEventType> | null = null;
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (cancelled) return;

      source = new EventSource(`${API_ROOT}/realtime/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      source.addEventListener("open", () => {
        if (everConnected.current) {
          for (const queryKey of CORE_QUERY_KEYS) {
            void queryClient.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
          }
        }
        everConnected.current = true;
        setStatus("CONNECTED");
      });

      source.addEventListener("error", () => {
        setStatus((prev) => (prev === "CONNECTED" ? "RECONNECTING" : "DISCONNECTED"));
      });

      for (const type of Object.keys(INVALIDATIONS) as RealtimeEventType[]) {
        source.addEventListener(type, (event) => {
          if (!event.data) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!isRealtimeEvent(parsed)) return;
          for (const queryKey of INVALIDATIONS[parsed.type]) {
            void queryClient.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
          }
        });
      }
    })();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [queryClient]);

  return { status };
}
