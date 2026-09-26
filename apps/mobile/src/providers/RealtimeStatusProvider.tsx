import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRealtime, type RealtimeStatus } from "@/src/lib/realtime";
import { formatClockTime } from "@/lib/format";

type RealtimeStatusContextValue = {
  status: RealtimeStatus;
  setStatus: (status: RealtimeStatus) => void;
};

const RealtimeStatusContext = createContext<RealtimeStatusContextValue | null>(null);

/**
 * Holds the realtime stream's connection status so screens can say "Live"
 * only while the stream is actually connected. Before this, `useRealtime()`'s
 * status was discarded and screens claimed "live" availability unconditionally.
 */
export function RealtimeStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RealtimeStatus>("DISCONNECTED");
  return <RealtimeStatusContext.Provider value={{ status, setStatus }}>{children}</RealtimeStatusContext.Provider>;
}

/** Current stream status; "DISCONNECTED" when no stream is mounted (signed out). */
export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeStatusContext)?.status ?? "DISCONNECTED";
}

/**
 * Opens the stream (see `useRealtime`) and publishes its status. On unmount
 * (sign-out, account or token change) the published status falls back to
 * DISCONNECTED so nothing keeps claiming a live connection.
 */
export function RealtimeConnection() {
  const { status } = useRealtime();
  const setStatus = useContext(RealtimeStatusContext)?.setStatus;

  useEffect(() => {
    setStatus?.(status);
  }, [status, setStatus]);

  useEffect(() => () => setStatus?.("DISCONNECTED"), [setStatus]);

  return null;
}

const LABEL: Record<RealtimeStatus, string> = {
  CONNECTED: "Live",
  RECONNECTING: "Reconnecting…",
  DISCONNECTED: "Not live",
  ERROR: "Not live",
};

/**
 * Pure: the connection line a screen shows. "Live" only while CONNECTED;
 * otherwise the plain state plus when this screen's data was last fetched
 * (React Query `dataUpdatedAt`, 0 when never fetched).
 */
export function connectionLabel(status: RealtimeStatus, updatedAt?: number): string {
  if (status === "CONNECTED") return LABEL.CONNECTED;
  return updatedAt ? `${LABEL[status]} · Updated ${formatClockTime(updatedAt)}` : LABEL[status];
}

/** `connectionLabel` bound to the live stream status. */
export function useConnectionLabel(updatedAt?: number): string {
  return connectionLabel(useRealtimeStatus(), updatedAt);
}
