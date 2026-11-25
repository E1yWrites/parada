"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { subscribeRealtimeEvents } from "@/lib/realtime";
import { STALE_AFTER_MS } from "@/components/Toaster";

/** The ticker hides this long after the last gate event, and its counts restart. */
export const GATE_QUIET_MS = 6000;

interface Burst {
  entries: number;
  exits: number;
  latest: { plate: string | null; zone: string; exited: boolean };
}

/**
 * Quiet gate feed, bottom right. Unlike the Toaster it never stacks: every
 * entry and exit folds into one pill ("3 in · 2 out · latest ABC-1234 left
 * Gym Annex") that hides after a quiet spell. Not a live region, so a busy
 * gate does not make a screen reader chatter; the same records are on
 * Sessions and the dashboard.
 */
export function GateTicker() {
  const [burst, setBurst] = useState<Burst | null>(null);
  const lastSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.type !== "PARKING_SESSION_STARTED" && event.type !== "PARKING_SESSION_COMPLETED") return;
      // Replays after a reconnect: already counted, or too old to be news.
      if (event.seq <= lastSeq.current) return;
      if (Date.now() - new Date(event.occurredAt).getTime() > STALE_AFTER_MS) return;
      lastSeq.current = event.seq;
      const exited = event.type === "PARKING_SESSION_COMPLETED";
      const s = event.payload;
      setBurst((prev) => ({
        entries: (prev?.entries ?? 0) + (exited ? 0 : 1),
        exits: (prev?.exits ?? 0) + (exited ? 1 : 0),
        latest: { plate: s.vehicle?.plateNumber ?? null, zone: s.zone.name, exited },
      }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setBurst(null), GATE_QUIET_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, []);

  if (!burst) return null;
  const { entries, exits, latest } = burst;
  const verb = latest.exited ? "left" : "entered";
  const who = `${latest.plate ?? "A vehicle"} · ${latest.zone}`;
  const text =
    entries + exits === 1
      ? `${who} ${verb}`
      : [entries && `${entries} in`, exits && `${exits} out`, `latest ${latest.plate ?? "a vehicle"} ${verb} ${latest.zone}`]
          .filter(Boolean)
          .join(" · ");
  const Icon = latest.exited ? LogOut : LogIn;

  return (
    <div aria-live="off" className="pointer-events-none fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)]">
      <Link
        href="/sessions"
        data-testid="gate-ticker"
        className="pointer-events-auto inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-line bg-card px-4 text-xs font-semibold text-muted shadow-card-hover animate-fade-in hover:text-charcoal focus-visible:outline-hidden focus-visible:shadow-focus"
      >
        <Icon className={`h-4 w-4 shrink-0 ${latest.exited ? "text-muted" : "text-success"}`} aria-hidden="true" />
        <span className="truncate">{text}</span>
      </Link>
    </div>
  );
}
