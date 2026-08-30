"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, OnlineBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";

export default function ZonesPage() {
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader title="Parking Zones" description="Zone-level occupancy for the facility." />

      <QueryBoundary
        status={zones.status}
        error={zones.error}
        isEmpty={zones.data?.length === 0}
        emptyTitle="No zones found."
        emptyMessage="No parking zones have been configured."
        loadingRows={4}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {zones.data?.map((z) => (
            <Link
              key={z.id}
              href={`/zones/${z.id}`}
              className="card block p-5 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {z.code} — {z.name}
                  </h2>
                  {z.description ? (
                    <p className="mt-1 text-sm text-slate-500">{z.description}</p>
                  ) : null}
                </div>
                <AvailabilityBadge availability={z.availability} />
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-sm text-slate-500">Occupancy</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {z.occupiedCount}
                    <span className="text-base font-normal text-slate-400"> / {z.capacity}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Available</p>
                  <p className="text-xl font-semibold text-slate-800">{z.availableCount}</p>
                </div>
              </div>

              <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Entry</p>
                  {z.entryCamera ? (
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-slate-600">{z.entryCamera.identifier}</span>
                      <OnlineBadge online={z.entryCamera.status === "ONLINE"} />
                    </div>
                  ) : (
                    <p className="text-slate-400">None</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400">Exit</p>
                  {z.exitCamera ? (
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-slate-600">{z.exitCamera.identifier}</span>
                      <OnlineBadge online={z.exitCamera.status === "ONLINE"} />
                    </div>
                  ) : (
                    <p className="text-slate-400">None</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}
