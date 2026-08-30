"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { StatCard, AvailabilityBadge, Pill } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export default function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
    refetchInterval: 30_000,
  });

  const d = dashboard.data;

  return (
    <div>
      <PageHeader title="Parking Overview" description="What is happening in the parking facility right now." />

      <QueryBoundary
        status={dashboard.status}
        error={dashboard.error}
        isEmpty={!d}
        emptyTitle="No data available."
        loadingRows={4}
      >
        {d ? (
          <div className="space-y-6">
            <section aria-label="Summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Capacity" value={d.summary.totalCapacity} />
              <StatCard label="Occupied" value={d.summary.totalOccupied} tone="brand" />
              <StatCard
                label="Available"
                value={d.summary.totalAvailable}
                tone={d.summary.totalAvailable === 0 ? "red" : "green"}
              />
              <StatCard
                label="Occupancy"
                value={`${Math.round(d.summary.occupancyPct)}%`}
                tone={d.summary.occupancyPct >= 100 ? "red" : d.summary.occupancyPct >= 0.8 ? "amber" : "slate"}
              />
            </section>

            <section aria-label="Operational" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Active Sessions" value={d.summary.activeSessions} detail="parking sessions in progress" />
              <StatCard
                label="Cameras Online"
                value={`${d.summary.onlineCameras} / ${d.summary.onlineCameras + d.summary.offlineCameras}`}
                detail={`${d.summary.offlineCameras} offline`}
                tone={d.summary.offlineCameras > 0 ? "amber" : "green"}
              />
              <StatCard label="Total Zones" value={d.summary.totalZones} />
            </section>

            <section aria-label="Zone status" className="card overflow-hidden">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                Zone Status
              </h2>
              <div className="divide-y divide-slate-100">
                {d.zones.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">No zones found.</p>
                ) : (
                  d.zones.map((z) => (
                    <div key={z.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <Link
                          href={`/zones/${z.id}`}
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          {z.code} — {z.name}
                        </Link>
                        <p className="text-sm text-slate-500">
                          {z.occupiedCount} / {z.capacity} occupied · {z.availableCount} available
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-600">
                          {Math.round(z.occupancyPct)}%
                        </span>
                        <AvailabilityBadge availability={z.availability} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section aria-label="Recent activity" className="card">
                <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                  Recent Activity
                </h2>
                {d.recentEvents.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">No recent activity.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recentEvents.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Pill tone={ev.eventType === "ENTRY" ? "green" : "amber"}>
                            {ev.eventType === "ENTRY" ? "ENTRY" : "EXIT"}
                          </Pill>
                          <Link href={`/zones/${ev.zoneId}`} className="text-sm text-slate-600 hover:underline">
                            Zone {ev.zoneCode}
                          </Link>
                          {ev.source === "SIMULATOR" ? (
                            <span className="text-xs font-medium text-slate-400">SIMULATION</span>
                          ) : null}
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(ev.detectedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Notifications" className="card">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
                  <Link href="/notifications" className="text-xs font-medium text-brand-700 hover:underline">
                    View all
                  </Link>
                </div>
                {d.recentNotifications.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">No notifications.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recentNotifications.map((n) => (
                      <li key={n.id} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Pill tone={n.type === "ZONE_FULL" ? "red" : "amber"}>{n.type}</Pill>
                          {!n.read ? (
                            <span className="text-xs font-semibold text-brand-700">Unread</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{n.message}</p>
                        <p className="text-xs text-slate-400">
                          {n.zone ? `${n.zone.code} · ` : ""}
                          {formatDate(n.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Anomalies" className="card">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-800">Anomalies</h2>
                  <Link href="/anomalies" className="text-xs font-medium text-brand-700 hover:underline">
                    View all
                  </Link>
                </div>
                {d.recentAnomalies.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">No anomalies detected.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recentAnomalies.map((a) => (
                      <li key={a.id} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Pill tone="red">{a.anomalyType}</Pill>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">
                          {a.detectedPlate ? `Plate ${a.detectedPlate}` : "Unknown plate"} ·{" "}
                          {a.zoneCode ? `Zone ${a.zoneCode}` : "unknown zone"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {a.resolved ? "RESOLVED" : "REVIEW REQUIRED"} · {formatDate(a.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
