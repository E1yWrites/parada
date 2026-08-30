"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, OnlineBadge, StatCard } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";

export default function ZoneDetailPage() {
  const params = useParams<{ id: string }>();
  const zoneId = params.id;

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });
  const occupancy = useQuery({
    queryKey: ["zone-occupancy", zoneId],
    queryFn: () => api.zoneOccupancy(zoneId),
    refetchInterval: 30_000,
  });

  const zone = zones.data?.find((z) => z.id === zoneId);
  const occ = occupancy.data ?? zone;

  const availability: "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE" =
    zone?.availability ??
    (occ && "capacity" in occ
      ? occ.occupiedCount >= occ.capacity
        ? "FULL"
        : occ.capacity - occ.occupiedCount <= occ.capacity * 0.2
          ? "LOW_AVAILABILITY"
          : "AVAILABLE"
      : "AVAILABLE");

  return (
    <div>
      <PageHeader
        title={zone ? `${zone.code} — ${zone.name}` : "Zone"}
        description={zone?.description ?? undefined}
        actions={
          zone ? (
            <Link href={`/history?zone=${zone.id}`} className="btn-secondary">
              View history
            </Link>
          ) : null
        }
      />

      <QueryBoundary
        status={occupancy.status}
        error={occupancy.error}
        isEmpty={!occupancy.data}
        emptyTitle="Zone not found."
        emptyMessage="The requested zone does not exist."
        loadingRows={3}
      >
        {occ && "capacity" in occ ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <AvailabilityBadge availability={availability} />
              <span className="text-sm text-slate-500">Zone status</span>
            </div>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Capacity" value={occ.capacity} />
              <StatCard label="Occupied" value={occ.occupiedCount} tone="brand" />
              <StatCard
                label="Available"
                value={occ.availableCount}
                tone={occ.availableCount === 0 ? "red" : "green"}
              />
              <StatCard
                label="Occupancy"
                value={`${Math.round((occ.occupiedCount / Math.max(1, occ.capacity)) * 100)}%`}
                tone={occ.occupiedCount >= occ.capacity ? "red" : "slate"}
              />
            </section>

            <section className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Cameras</h2>
              {zone?.cameras.length === 0 ? (
                <p className="text-sm text-slate-500">No cameras configured for this zone.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(zone?.cameras ?? []).map((cam) => (
                    <div key={cam.id} className="rounded-md border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          {cam.gateType} CAMERA
                        </span>
                        <OnlineBadge online={cam.status === "ONLINE"} />
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{cam.name}</p>
                      <p className="text-sm text-slate-500">{cam.identifier}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
