"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bell, CarFront, TriangleAlert, ArrowRight, Wifi, WifiOff } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, AnomalyTypeBadge, ReadBadge } from "@/components/ui/Badge";
import { formatDateTime, formatPct } from "@/lib/format";

function OccupancyBar({ pct }: { pct: number }) {
  const color =
    pct >= 100 ? "bg-[#EA580C]" : pct >= 80 ? "bg-amber-400" : "bg-[#F7931A]";
  return (
    <div className="occupancy-bar">
      <div
        className={`h-full rounded-full ${color} transition-all duration-300`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
    refetchInterval: 30_000,
  });

  const data = dashboard.data;

  return (
    <div>
      <PageHeader
        eyebrow="Overview · Live facility telemetry"
        title="Parking Operations"
        description="What is happening in the parking facility right now."
      />

      <QueryBoundary
        status={dashboard.status}
        error={dashboard.error}
        isEmpty={!data}
        loadingRows={4}
        onRetry={() => dashboard.refetch()}
      >
        {data ? (
          <div className="space-y-8">
            {/* Primary metrics */}
            <section aria-label="Facility summary">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total capacity"
                  value={data.summary.totalCapacity}
                  detail="Facility capacity"
                  accent="none"
                />
                <MetricCard
                  label="Occupied"
                  value={data.summary.totalOccupied}
                  detail={`${formatPct(data.summary.occupancyPct)} of capacity`}
                  accent={data.summary.occupancyPct >= 80 ? "amber" : "none"}
                />
                <MetricCard
                  label="Available"
                  value={data.summary.totalAvailable}
                  detail="Open spaces"
                  accent={data.summary.totalAvailable === 0 ? "red" : "none"}
                />
                <MetricCard
                  label="Active sessions"
                  value={data.summary.activeSessions}
                  detail="Current vehicles"
                  accent="orange"
                />
              </div>
            </section>

            {/* Zone status */}
            <section aria-label="Zone status">
              <SectionHeader
                eyebrow="Live occupancy"
                title="Zone Status"
                actions={
                  <Link href="/zones" className="btn-ghost text-xs">
                    View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                }
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.zones.map((z) => (
                  <Link key={z.id} href={`/zones/${z.id}`} className="card card-hover block p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="label-tech">ZONE {z.code}</p>
                        <p className="mt-0.5 text-sm text-white">{z.name}</p>
                      </div>
                      <AvailabilityBadge value={z.availability} />
                    </div>
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between">
                        <p className="font-mono text-2xl font-bold text-white">
                          {z.occupiedCount}
                          <span className="text-sm font-medium text-muted"> / {z.capacity}</span>
                        </p>
                        <p className="font-mono text-xs text-muted">{formatPct(z.occupancyPct)}</p>
                      </div>
                      <div className="mt-2">
                        <OccupancyBar pct={z.occupancyPct} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Facility grid: cameras + activity */}
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Camera health */}
              <Card>
                <SectionHeader
                  eyebrow="Infrastructure"
                  title="Camera Health"
                  actions={
                    <Link href="/cameras" className="btn-ghost text-xs">
                      Status <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                <div className="grid grid-cols-2 gap-4 p-5">
                  <div className="surface-panel flex items-center gap-3 p-4">
                    <Wifi className="h-6 w-6 text-emerald-300" aria-hidden="true" />
                    <div>
                      <p className="font-mono text-2xl font-bold text-white">{data.summary.onlineCameras}</p>
                      <p className="text-[11px] uppercase tracking-wider text-muted">Online</p>
                    </div>
                  </div>
                  <div className="surface-panel flex items-center gap-3 p-4">
                    <WifiOff className="h-6 w-6 text-rose-300" aria-hidden="true" />
                    <div>
                      <p className="font-mono text-2xl font-bold text-white">{data.summary.offlineCameras}</p>
                      <p className="text-[11px] uppercase tracking-wider text-muted">Offline</p>
                    </div>
                  </div>
                  <div className="surface-panel flex items-center gap-3 p-4 col-span-2">
                    <Activity className="h-6 w-6 text-orange" aria-hidden="true" />
                    <div>
                      <p className="font-mono text-2xl font-bold text-white">{data.summary.totalZones}</p>
                      <p className="text-[11px] uppercase tracking-wider text-muted">Active zones</p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Recent activity */}
              <Card>
                <SectionHeader
                  eyebrow="Live feed"
                  title="Recent Parking Activity"
                  actions={
                    <Link href="/sessions" className="btn-ghost text-xs">
                      Sessions <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentEvents.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No recent parking events.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {data.recentEvents.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full ${
                              ev.eventType === "ENTRY" ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                            }`}
                            aria-hidden="true"
                          >
                            <CarFront className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-mono text-sm font-semibold text-white">
                              {ev.detectedPlate ?? "Unknown plate"}
                            </p>
                            <p className="text-[11px] text-muted">
                              {ev.eventType} · {ev.source}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs text-white">{formatDateTime(ev.detectedAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            {/* Notifications + Anomalies */}
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <SectionHeader
                  eyebrow="Operational alerts"
                  title="Notifications"
                  actions={
                    <Link href="/notifications" className="btn-ghost text-xs">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentNotifications.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No notifications.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {data.recentNotifications.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Bell className="h-4 w-4 text-orange" aria-hidden="true" />
                          <div>
                            <p className="text-sm text-white">{n.message}</p>
                            <p className="text-[11px] text-muted">
                              {n.zone ? `Zone ${n.zone.code}` : "All zones"} · {formatDateTime(n.createdAt)}
                            </p>
                          </div>
                        </div>
                        <ReadBadge read={n.read} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionHeader
                  eyebrow="Exceptions"
                  title="Anomalies"
                  actions={
                    <Link href="/anomalies" className="btn-ghost text-xs">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentAnomalies.length === 0 ? (
                  <EmptyActivity />
                ) : (
                  <ul className="divide-y divide-white/5">
                    {data.recentAnomalies.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
                          <div>
                            <AnomalyTypeBadge type={a.anomalyType} />
                            <p className="mt-1 text-[11px] text-muted">
                              {a.zoneCode ? `Zone ${a.zoneCode}` : "—"} · {formatDateTime(a.createdAt)}
                            </p>
                          </div>
                        </div>
                        {a.detectedPlate ? (
                          <p className="font-mono text-xs text-white">{a.detectedPlate}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="font-mono text-3xl text-muted/40" aria-hidden="true">
        ∅
      </div>
      <p className="mt-2 text-sm text-muted">No anomalies detected.</p>
    </div>
  );
}
