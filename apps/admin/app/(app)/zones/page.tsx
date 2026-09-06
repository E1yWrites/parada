"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPinned, ArrowRight, DoorOpen, DoorClosed } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge } from "@/components/ui/Badge";
import { formatPct } from "@/lib/format";

function OccupancyBar({ pct }: { pct: number }) {
  const color =
    pct >= 100 ? "bg-brand" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="occupancy-bar">
      <div
        className={`h-full rounded-full ${color} transition-all duration-300`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default function ZonesPage() {
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Parking · Zone inventory"
        title="Zones"
        description="Occupancy at the zone level (entry / exit gate counting)."
      />

      <QueryBoundary
        status={zones.status}
        error={zones.error}
        isEmpty={!zones.data || zones.data.length === 0}
        emptyTitle="No parking zones yet."
        emptyMessage="Zones will appear here once they are configured by the backend."
        loadingRows={4}
        onRetry={() => zones.refetch()}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {zones.data?.map((z) => (
            <Link
              key={z.id}
              href={`/zones/${z.id}`}
              className="card card-hover block p-5"
              aria-label={`View zone ${z.name}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-brand-soft">
                    <MapPinned className="h-5 w-5 text-brand" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="label-tech">ZONE {z.code}</p>
                    <p className="mt-0.5 font-display text-base font-black text-charcoal">{z.name}</p>
                  </div>
                </div>
                <AvailabilityBadge value={z.availability} />
              </div>

              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <p className="font-display text-3xl font-black leading-none text-charcoal">
                    {z.occupiedCount}
                    <span className="text-base font-bold text-muted"> / {z.capacity}</span>
                  </p>
                  <p className="text-xs font-bold text-muted">
                    {z.availableCount} available · {formatPct(z.occupancyPct)}
                  </p>
                </div>
                <div className="mt-2.5">
                  <OccupancyBar pct={z.occupancyPct} />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-line/50 pt-4">
                <div className="flex items-center gap-4 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1.5">
                    <DoorClosed className="h-4 w-4 text-charcoal" aria-hidden="true" />
                    {z.entryCamera ? z.entryCamera.identifier : "No entry cam"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DoorOpen className="h-4 w-4 text-charcoal" aria-hidden="true" />
                    {z.exitCamera ? z.exitCamera.identifier : "No exit cam"}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}