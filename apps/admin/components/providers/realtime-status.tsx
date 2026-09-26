"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRealtime, type RealtimeStatus } from "@/lib/realtime";

type RealtimeStatusContextValue = {
  status: RealtimeStatus;
  setStatus: (status: RealtimeStatus) => void;
};

const RealtimeStatusContext = createContext<RealtimeStatusContextValue | null>(null);

/**
 * Holds the realtime stream's connection status so the UI can say "Live"
 * only while the stream is actually connected. Without this, `useRealtime()`'s
 * status was discarded and the shell showed a hard-coded green "Live" dot.
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
 * (sign-out, account switch) the published status falls back to
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
