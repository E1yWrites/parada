import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import EventSource from "react-native-sse";
import {
  REALTIME_SYNC_EVENT,
  isRealtimeEvent,
  isRealtimeSyncFrame,
  type RealtimeEventType,
} from "@parada/types";
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
  ASSIGNMENT_CANCELLED: [queryKeys.assignments],
  VIOLATION_CREATED: [queryKeys.violations],
  VIOLATION_UPDATED: [queryKeys.violations],
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

/** Event names the connection subscribes to: every domain event plus the hub's
 *  SYNC control frame. */
type SubscribedEvent = RealtimeEventType | typeof REALTIME_SYNC_EVENT;

/**
 * Direct-to-API SSE connection using the same bearer token every other mobile
 * request already sends (no proxy needed — unlike Admin, the token is not
 * httpOnly here). A disconnect/error NEVER calls notifyAuthInvalidated: only
 * an explicit 401 from the existing REST client does that (unchanged).
 *
 * react-native-sse tracks the last `id:` it saw and re-sends it as
 * Last-Event-ID on its own reconnect, so the backend can replay what this
 * device missed; anything it cannot replay arrives as a SYNC frame instead.
 */
export function useRealtime(): { status: RealtimeStatus } {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("DISCONNECTED");
  const everConnected = useRef(false);
  /** Highest hub sequence this mount has acted on. Survives reconnects on
   *  purpose: it is what makes a replayed or out-of-order frame identifiable. */
  const lastSeq = useRef(0);
  /** Bumped when the app returns to the foreground, to force a fresh
   *  connection: the OS can silently kill the socket while backgrounded, and a
   *  dead EventSource never reports an error we could react to. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") setGeneration((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let source: EventSource<SubscribedEvent> | null = null;
    let cancelled = false;

    const resync = () => {
      for (const queryKey of CORE_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
      }
    };

    (async () => {
      const token = await getToken();
      if (cancelled) return;

      source = new EventSource<SubscribedEvent>(`${API_ROOT}/realtime/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      source.addEventListener("open", () => {
        if (everConnected.current) {
          resync();
        }
        everConnected.current = true;
        setStatus("CONNECTED");
      });

      source.addEventListener("error", () => {
        setStatus((prev) => (prev === "CONNECTED" ? "RECONNECTING" : "DISCONNECTED"));
      });

      // The hub could not replay everything we missed. It sends no parking
      // state with this — we go back to REST for it.
      source.addEventListener(REALTIME_SYNC_EVENT, (event) => {
        // Adopt the hub's head as our cursor. After an API restart its seq
        // counter is back near zero, so keeping our old (higher) cursor would
        // make the gate below discard every event the new process publishes.
        let head = 0;
        if (event.data) {
          try {
            const parsed: unknown = JSON.parse(event.data);
            if (isRealtimeSyncFrame(parsed)) head = parsed.headSeq;
          } catch {
            head = 0;
          }
        }
        lastSeq.current = head;
        resync();
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
          // Stale, duplicated, or out-of-order: the hub's seq only ever moves
          // forward, so anything at or below what we have already acted on
          // carries no new information and is dropped.
          if (parsed.seq <= lastSeq.current) return;
          lastSeq.current = parsed.seq;
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
  }, [queryClient, generation]);

  return { status };
}
