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
  const color = pct >= 100 ? "bg-[#EA580C]" : pct >= 80 ? "bg-amber-400" : "bg-[#F7931A]";
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
        emptyTitle="No parking zones."
        loadingRows={4}
        onRetry={() => zones.refetch()}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {zones.data?.map((z) => (
            <Link key={z.id} href={`/zones/${z.id}`} className="card card-hover block p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/15">
                    <MapPinned className="h-5 w-5 text-orange" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="label-tech">ZONE {z.code}</p>
                    <p className="mt-0.5 text-sm font-medium text-white">{z.name}</p>
                  </div>
                </div>
                <AvailabilityBadge value={z.availability} />
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-3xl font-bold text-white">
                    {z.occupiedCount}
                    <span className="text-base font-medium text-muted"> / {z.capacity}</span>
                  </p>
                  <p className="font-mono text-xs text-muted">{formatPct(z.occupancyPct)}</p>
                </div>
                <div className="mt-2">
                  <OccupancyBar pct={z.occupancyPct} />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <div className="flex items-center gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <DoorClosed className="h-3.5 w-3.5" aria-hidden="true" />
                    {z.entryCamera ? z.entryCamera.identifier : "No entry cam"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
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
