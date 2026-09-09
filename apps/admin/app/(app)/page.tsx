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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total capacity"
                  value={data.summary.totalCapacity}
                  detail="Facility capacity"
                  accent="none"
                />
                <MetricCard
                  label="Current occupancy"
                  value={`${formatPct(data.summary.occupancyPct)}`}
                  detail={`${data.summary.totalOccupied} of ${data.summary.totalCapacity} spaces occupied`}
                  accent={data.summary.occupancyPct >= 80 ? "amber" : "none"}
                />
                <MetricCard
                  label="Available"
                  value={data.summary.totalAvailable}
                  detail="Open spaces"
                  accent={data.summary.totalAvailable === 0 ? "red" : "green"}
                />
                <MetricCard
                  label="Active sessions"
                  value={data.summary.activeSessions}
                  detail="Current vehicles"
                  accent="info"
                />
              </div>
            </section>

            {/* Zone status */}
            <section aria-label="Zone status">
              <SectionHeader
                eyebrow="Live occupancy"
                title="Zone Status"
                actions={
                  <Link href="/zones" className="btn-ghost min-h-[36px] rounded-full px-4 text-xs">
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
                        <p className="mt-0.5 font-display text-base font-black text-charcoal">{z.name}</p>
                      </div>
                      <AvailabilityBadge value={z.availability} />
                    </div>
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between">
                        <p className="font-display text-2xl font-black text-charcoal">
                          {z.occupiedCount}
                          <span className="text-base font-bold text-muted"> / {z.capacity}</span>
                        </p>
                        <p className="text-xs font-bold text-muted">{formatPct(z.occupancyPct)}</p>
                      </div>
                      <div className="mt-2.5">
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
                    <Link href="/cameras" className="btn-ghost min-h-[36px] rounded-full px-4 text-xs">
                      Status <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                <div className="grid grid-cols-2 gap-4 p-5">
                  <div className="surface-panel flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-emerald-50" aria-hidden="true">
                      <Wifi className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-black text-charcoal">{data.summary.onlineCameras}</p>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Online</p>
                    </div>
                  </div>
                  <div className="surface-panel flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-white" aria-hidden="true">
                      <WifiOff className="h-5 w-5 text-muted" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-black text-charcoal">{data.summary.offlineCameras}</p>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Offline</p>
                    </div>
                  </div>
                  <div className="surface-panel col-span-2 flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-brand-soft" aria-hidden="true">
                      <Activity className="h-5 w-5 text-brand" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-black text-charcoal">{data.summary.totalZones}</p>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Active zones</p>
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
                    <Link href="/sessions" className="btn-ghost min-h-[36px] rounded-full px-4 text-xs">
                      Sessions <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentEvents.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No recent parking events.</p>
                ) : (
                  <ul className="divide-y divide-line/30">
                    {data.recentEvents.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-panel ${
                              ev.eventType === "ENTRY" ? "bg-emerald-50 text-emerald-600" : "bg-brand-soft text-brand"
                            }`}
                            aria-hidden="true"
                          >
                            <CarFront className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-bold text-charcoal">
                              {ev.detectedPlate ?? "Unknown plate"}
                            </p>
                            <p className="text-[11px] font-semibold text-muted">
                              {ev.eventType} · {ev.source}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-charcoal">{formatDateTime(ev.detectedAt)}</p>
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
                    <Link href="/notifications" className="btn-ghost min-h-[36px] rounded-full px-4 text-xs">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentNotifications.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No notifications.</p>
                ) : (
                  <ul className="divide-y divide-line/30">
                    {data.recentNotifications.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-panel bg-brand-soft text-brand" aria-hidden="true">
                            <Bell className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-charcoal">{n.message}</p>
                            <p className="text-[11px] font-semibold text-muted">
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
                    <Link href="/anomalies" className="btn-ghost min-h-[36px] rounded-full px-4 text-xs">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentAnomalies.length === 0 ? (
                  <EmptyActivity />
                ) : (
                  <ul className="divide-y divide-line/30">
                    {data.recentAnomalies.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-panel bg-amber-50 text-amber-600" aria-hidden="true">
                            <TriangleAlert className="h-4 w-4" />
                          </span>
                          <div>
                            <AnomalyTypeBadge type={a.anomalyType} />
                            <p className="mt-1 text-[11px] font-semibold text-muted">
                              {a.zoneCode ? `Zone ${a.zoneCode}` : "—"} · {formatDateTime(a.createdAt)}
                            </p>
                          </div>
                        </div>
                        {a.detectedPlate ? (
                          <p className="text-xs font-bold text-charcoal">{a.detectedPlate}</p>
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
      <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-graygreen/25 text-muted" aria-hidden="true">
        <TriangleAlert className="h-5 w-5" />
      </div>
      <p className="mt-2 text-sm font-semibold text-muted">No anomalies detected.</p>
    </div>
  );
}