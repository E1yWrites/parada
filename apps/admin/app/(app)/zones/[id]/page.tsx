"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPinned, DoorClosed, DoorOpen, Clock3 } from "lucide-react";
import { api } from "@/lib/api/client";
import { Card, SectionHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, OnlineBadge } from "@/components/ui/Badge";
import { formatDateTime, formatPct } from "@/lib/format";

export default function ZoneDetailPage() {
  const params = useParams<{ id: string }>();
  const zoneId = params.id;

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  const history = useQuery({
    queryKey: ["history", zoneId],
    queryFn: () => api.history(zoneId, { limit: 30 }),
    enabled: !!zoneId,
  });

  const zone = zones.data?.find((z) => z.id === zoneId);

  return (
    <div>
      <Link href="/zones" className="btn-ghost mb-4 -ml-2 text-xs">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to zones
      </Link>

      <QueryBoundary status={zones.status} error={zones.error} isEmpty={!zone} loadingRows={3}>
        {zone ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange/15">
                  <MapPinned className="h-6 w-6 text-orange" aria-hidden="true" />
                </div>
                <div>
                  <p className="label-tech">ZONE {zone.code}</p>
                  <h1 className="font-display text-2xl font-bold text-white">{zone.name}</h1>
                  {zone.description ? <p className="mt-0.5 text-sm text-muted">{zone.description}</p> : null}
                </div>
              </div>
              <AvailabilityBadge value={zone.availability} />
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Capacity" value={zone.capacity} detail="Total spaces" />
              <MetricCard
                label="Occupied"
                value={zone.occupiedCount}
                detail={formatPct(zone.occupancyPct)}
                accent={zone.availability === "FULL" ? "red" : zone.availability === "LOW_AVAILABILITY" ? "amber" : "none"}
              />
              <MetricCard
                label="Available"
                value={zone.availableCount}
                detail="Open spaces"
                accent={zone.availableCount === 0 ? "red" : "none"}
              />
              <MetricCard label="Occupancy" value={formatPct(zone.occupancyPct)} detail="Of capacity" accent="orange" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Cameras */}
              <Card>
                <SectionHeader eyebrow="Infrastructure" title="Gate Cameras" />
                <div className="divide-y divide-white/5">
                  {[zone.entryCamera, zone.exitCamera].filter(Boolean).map((cam) => {
                    const isEntry = zone.entryCamera?.id === cam!.id;
                    return (
                      <div key={cam!.id} className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-3">
                          {isEntry ? (
                            <DoorClosed className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                          ) : (
                            <DoorOpen className="h-4 w-4 text-sky-300" aria-hidden="true" />
                          )}
                          <div>
                            <p className="font-mono text-sm font-semibold text-white">{cam!.identifier}</p>
                            <p className="text-[11px] uppercase tracking-wider text-muted">
                              {isEntry ? "Entry" : "Exit"} gate
                            </p>
                          </div>
                        </div>
                        {(() => {
                          const camStatus = zone.cameras.find((c) => c.id === cam!.id)?.status;
                          return <OnlineBadge online={camStatus === "ONLINE"} />;
                        })()}
                      </div>
                    );
                  })}
                  {!zone.entryCamera && !zone.exitCamera ? (
                    <p className="p-5 text-sm text-muted">No cameras assigned to this zone.</p>
                  ) : null}
                </div>
              </Card>

              {/* Recent history snapshot */}
              <Card>
                <SectionHeader
                  eyebrow="Over time"
                  title="Occupancy History"
                  actions={
                    <Link href="/history" className="btn-ghost text-xs">
                      View history <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                <div className="p-5">
                  <QueryBoundary status={history.status} error={history.error} isEmpty={!history.data}>
                    {history.data && history.data.entries.length > 0 ? (
                      <ul className="space-y-1.5">
                        {history.data.entries.slice(-8).map((e) => (
                          <li key={e.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-sm">
                            <span className="font-mono text-xs text-muted">{formatDateTime(e.occurredAt)}</span>
                            <span className="font-mono font-semibold text-white">{e.occupiedCount}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">No occupancy history recorded for this zone yet.</p>
                    )}
                  </QueryBoundary>
                </div>
              </Card>
            </div>

            {/* Occupancy timeline bar */}
            {history.data && history.data.entries.length > 0 ? (
              <Card>
                <SectionHeader eyebrow="Trend" title="Occupancy Over Time" />
                <div className="p-5">
                  <div className="flex h-24 items-end gap-0.5">
                    {history.data.entries.slice(-40).map((e) => {
                      const h = history.data!.zone.capacity > 0 ? (e.occupiedCount / history.data!.zone.capacity) * 100 : 0;
                      return (
                        <div
                          key={e.id}
                          title={`${e.occupiedCount} / ${history.data!.zone.capacity}`}
                          className="flex-1 rounded-sm bg-[#F7931A]/70 hover:bg-orange"
                          style={{ height: `${Math.max(4, h)}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
