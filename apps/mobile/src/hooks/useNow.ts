import { useEffect, useState } from "react";

/** Re-render on an interval while enabled (drives the live elapsed clock). */
export function useNow(intervalMs = 30_000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}