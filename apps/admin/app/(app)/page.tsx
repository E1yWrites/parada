"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, CarFront, TriangleAlert, ArrowRight, Wifi, WifiOff, DoorClosed, DoorOpen } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { FacilityStrip, MetricCard } from "@/components/ui/MetricCard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, AnomalyTypeBadge, PlateChip, ReadBadge, AVAILABILITY_BAR } from "@/components/ui/Badge";
import { formatDateTime, formatPct } from "@/lib/format";

function OccupancyBar({ pct, availability }: { pct: number; availability: keyof typeof AVAILABILITY_BAR }) {
  return (
    <div className="occupancy-bar" aria-hidden="true">
      <div
        className={`h-full rounded-full ${AVAILABILITY_BAR[availability]} transition-[width] duration-500 ease-out`}
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
        title="Parking Operations"
        description="Live zone occupancy, gate cameras and the latest events, refreshed every 30 seconds."
      />

      <QueryBoundary
        status={dashboard.status}
        error={dashboard.error}
        isEmpty={!data}
        loadingRows={4}
        onRetry={() => dashboard.refetch()}
      >
        {data ? (
          <div className="space-y-6">
            {/* Facility strip: one panel, four figures */}
            <FacilityStrip label="Facility summary">
              <MetricCard label="Capacity" value={data.summary.totalCapacity} detail={`${data.summary.totalZones} zones`} />
              <MetricCard
                label="Occupied"
                value={formatPct(data.summary.occupancyPct)}
                detail={`${data.summary.totalOccupied} of ${data.summary.totalCapacity} spaces`}
                accent={data.summary.occupancyPct >= 100 ? "red" : data.summary.occupancyPct >= 80 ? "amber" : "none"}
              />
              <MetricCard
                label="Available"
                value={data.summary.totalAvailable}
                detail="Open spaces right now"
                accent={data.summary.totalAvailable === 0 ? "red" : "green"}
              />
              <MetricCard
                label="Active sessions"
                value={data.summary.activeSessions}
                detail={`${data.summary.onlineCameras} of ${data.summary.onlineCameras + data.summary.offlineCameras} cameras online`}
                accent="info"
              />
            </FacilityStrip>

            {/* Zone lanes */}
            <Card>
              <SectionHeader
                title="Zones"
                description="Authoritative zone-level availability"
                actions={
                  <Link href="/zones" className="btn-ghost btn-sm">
                    Manage zones <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                }
              />
              {data.zones.length === 0 ? (
                <p className="p-5 text-sm text-muted">No zones configured yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.zones.map((z) => (
                    <li key={z.id}>
                      <Link
                        href={`/zones/${z.id}`}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors duration-100 hover:bg-raised/60 focus-visible:outline-none focus-visible:bg-raised sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(8rem,1fr)_auto_auto]"
                      >
                        <PlateChip>{z.code}</PlateChip>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-charcoal">{z.name}</p>
                          <p className="text-xs text-muted">
                            {z.availableCount} available · {formatPct(z.occupancyPct)}
                          </p>
                        </div>
                        <p className="font-display text-lg font-black tabular-nums text-charcoal sm:order-4">
                          {z.occupiedCount}
                          <span className="text-sm font-bold text-muted"> / {z.capacity}</span>
                        </p>
                        <div className="col-span-3 sm:order-3 sm:col-span-1">
                          <OccupancyBar pct={z.occupancyPct} availability={z.availability} />
                        </div>
                        <div className="col-span-3 sm:order-5 sm:col-span-1">
                          <AvailabilityBadge value={z.availability} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Recent activity */}
              <Card>
                <SectionHeader
                  title="Recent parking activity"
                  description="Latest gate events from the cameras"
                  actions={
                    <Link href="/sessions" className="btn-ghost btn-sm">
                      Sessions <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentEvents.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No recent parking events.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recentEvents.map((ev) => {
                      const entry = ev.eventType === "ENTRY";
                      return (
                        <li key={ev.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
                                entry ? "bg-success-soft text-success" : "bg-brand-soft text-brand"
                              }`}
                              aria-hidden="true"
                            >
                              {entry ? <DoorClosed className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-bold text-charcoal">{ev.detectedPlate ?? "Unknown plate"}</p>
                              <p className="text-[11px] font-semibold text-muted">
                                {entry ? "Entry" : "Exit"} · {ev.source}
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 font-mono text-xs font-semibold text-muted">{formatDateTime(ev.detectedAt)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* Cameras */}
              <Card>
                <SectionHeader
                  title="Gate cameras"
                  description="Vision pipeline health"
                  actions={
                    <Link href="/cameras" className="btn-ghost btn-sm">
                      Cameras <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                <div className="grid grid-cols-2 divide-x divide-line">
                  <div className="flex items-center gap-3 px-5 py-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-control bg-success-soft" aria-hidden="true">
                      <Wifi className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-black leading-none text-charcoal">{data.summary.onlineCameras}</p>
                      <p className="mt-1 text-xs font-bold text-muted">Online</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-control bg-raised" aria-hidden="true">
                      <WifiOff className="h-5 w-5 text-muted" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-black leading-none text-charcoal">{data.summary.offlineCameras}</p>
                      <p className="mt-1 text-xs font-bold text-muted">Offline</p>
                    </div>
                  </div>
                </div>
                {data.summary.offlineCameras > 0 ? (
                  <p className="border-t border-line px-5 py-3 text-xs font-semibold text-warning">
                    Offline cameras stop counting at their gate. Check them from the Cameras page.
                  </p>
                ) : null}
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <SectionHeader
                  title="Notifications"
                  description="Zone-full and low-availability alerts"
                  actions={
                    <Link href="/notifications" className="btn-ghost btn-sm">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentNotifications.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No notifications.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recentNotifications.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand" aria-hidden="true">
                            <Bell className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className={`whitespace-normal break-words text-sm ${n.read ? "text-muted" : "font-bold text-charcoal"}`}>{n.message}</p>
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
                  title="Anomalies"
                  description="Exceptions that need a look"
                  actions={
                    <Link href="/anomalies" className="btn-ghost btn-sm">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {data.recentAnomalies.length === 0 ? (
                  <div className="flex items-center gap-3 px-5 py-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-control bg-success-soft text-success" aria-hidden="true">
                      <CarFront className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-muted">No anomalies detected.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recentAnomalies.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-warning-soft text-warning" aria-hidden="true">
                            <TriangleAlert className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <AnomalyTypeBadge type={a.anomalyType} />
                            <p className="mt-1 text-[11px] font-semibold text-muted">
                              {a.zoneCode ? `Zone ${a.zoneCode}` : "—"} · {formatDateTime(a.createdAt)}
                            </p>
                          </div>
                        </div>
                        {a.detectedPlate ? <PlateChip soft>{a.detectedPlate}</PlateChip> : null}
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
