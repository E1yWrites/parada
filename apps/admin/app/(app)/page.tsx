"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CarFront,
  ArrowRight,
  Wifi,
  WifiOff,
  DoorClosed,
  DoorOpen,
  Gauge,
  ShieldAlert,
  TriangleAlert,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, PlateChip, AVAILABILITY_BAR } from "@/components/ui/Badge";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { formatDateTime, formatPct } from "@/lib/format";
import type { AdminAnomaly, AdminNotification } from "@/lib/api/types";

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

/**
 * Facility-wide occupancy over the last 24h, from real `OccupancyHistory`
 * snapshots aggregated server-side (see `buildOccupancyTrend` in
 * services/api) — never a placeholder or synthetic series. `viewBox` is
 * unitless (100 x 40); `preserveAspectRatio="none"` lets the SVG stretch to
 * fill the card, and `vector-effect="non-scaling-stroke"` keeps the line's
 * stroke width constant despite that non-uniform scaling.
 */
function OccupancyTrendChart({ trend }: { trend: { at: string; totalOccupied: number; totalCapacity: number }[] }) {
  if (trend.length === 0) {
    return <p className="p-5 text-sm text-muted">No occupancy data yet.</p>;
  }

  const pct = trend.map((p) => (p.totalCapacity > 0 ? Math.min(100, (p.totalOccupied / p.totalCapacity) * 100) : 0));
  const n = pct.length;
  const toXY = (i: number) => {
    const x = n > 1 ? (i / (n - 1)) * 100 : 0;
    const y = 38 - (pct[i]! / 100) * 34;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const linePath = pct.map((_, i) => `${i === 0 ? "M" : "L"}${toXY(i)}`).join(" ");
  const areaPath = `${linePath} L100,40 L0,40 Z`;
  const current = pct[n - 1] ?? 0;
  const first = trend[0];
  const last = trend[n - 1];

  return (
    <div className="px-5 pb-5 pt-1">
      <p className="font-display text-3xl font-black tabular-nums text-charcoal">
        {Math.round(current)}
        <span className="text-base font-bold text-muted">% occupied right now</span>
      </p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-4 h-32 w-full sm:h-40" aria-hidden="true">
        <path d={areaPath} className="fill-brand/10" stroke="none" />
        <path
          d={linePath}
          className="stroke-brand"
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-muted">
        <span>{first ? formatDateTime(first.at) : ""}</span>
        <span>{last ? formatDateTime(last.at) : ""}</span>
      </div>
    </div>
  );
}

const STAT_ACCENTS = {
  info: { icon: "text-brand-dark", ring: "bg-brand-soft", bar: "bg-brand" },
  green: { icon: "text-success", ring: "bg-success-soft", bar: "bg-success" },
  amber: { icon: "text-warning", ring: "bg-warning-soft", bar: "bg-warning" },
  red: { icon: "text-danger", ring: "bg-danger-soft", bar: "bg-danger" },
} as const;

/**
 * One figure in the operational stat composition. `hero` renders the facility's
 * single most important number at display scale with its own occupancy track;
 * `default` is the smaller companion figure. Together they replace the former
 * uniform four-up card grid — the audit's flagged "generic SaaS" pattern —
 * with a deliberately asymmetric read: one number leads, the rest support it.
 */
function StatPanel({
  label,
  value,
  detail,
  trend,
  accent,
  icon: Icon,
  size = "default",
  progressPct,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  trend?: string;
  accent: keyof typeof STAT_ACCENTS;
  icon: LucideIcon;
  size?: "hero" | "default";
  /** 0-100: renders a slim occupancy track under the number (hero only). */
  progressPct?: number;
}) {
  const tone = STAT_ACCENTS[accent];
  const hero = size === "hero";
  return (
    <Card className={`flex h-full flex-col justify-between ${hero ? "p-6" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`font-bold text-muted ${hero ? "text-sm" : "text-xs"}`}>{label}</p>
        <span
          className={`flex shrink-0 items-center justify-center rounded-control rounded-tr-control-cut ${tone.ring} ${hero ? "h-10 w-10" : "h-8 w-8"}`}
          aria-hidden="true"
        >
          <Icon className={hero ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2} />
        </span>
      </div>
      <div>
        <p
          className={`font-display font-black leading-none tabular-nums text-charcoal ${
            hero ? "mt-4 text-5xl" : "mt-2 text-2xl"
          }`}
        >
          {value}
        </p>
        <p className={`font-semibold text-muted ${hero ? "mt-2 text-sm" : "mt-1.5 text-xs"}`}>{detail}</p>
        {trend ? <p className={`mt-2 text-sm font-semibold ${tone.icon}`}>{trend}</p> : null}
        {hero && progressPct !== undefined ? (
          <div className="occupancy-bar mt-4">
            <div className={`h-full rounded-full ${tone.bar} transition-[width] duration-500 ease-out`} style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

type AlertItem =
  | { kind: "anomaly"; id: string; createdAt: string; anomaly: AdminAnomaly }
  | { kind: "notification"; id: string; createdAt: string; notification: AdminNotification };

/** Merges real anomalies + notifications (both genuine alert-shaped records)
 * into one time-sorted feed, matching the Figma "Live Alerts" panel. Recent
 * entry/exit events are left out — they aren't anomalous, so folding them in
 * here would misrepresent them as alerts. */
function buildAlertFeed(anomalies: AdminAnomaly[], notifications: AdminNotification[]): AlertItem[] {
  const items: AlertItem[] = [
    ...anomalies.map((a) => ({ kind: "anomaly" as const, id: `a-${a.id}`, createdAt: a.createdAt, anomaly: a })),
    ...notifications.map((n) => ({ kind: "notification" as const, id: `n-${n.id}`, createdAt: n.createdAt, notification: n })),
  ];
  return items.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()).slice(0, 6);
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
      <PageHeader title="Dashboard" description="Real-time parking management overview" />

      <QueryBoundary
        status={dashboard.status}
        error={dashboard.error}
        isEmpty={!data}
        loadingRows={4}
        onRetry={() => dashboard.refetch()}
      >
        {data ? (
          <div className="space-y-6">
            {/* Asymmetric stat composition: one hero figure (the facility's
                single most important number) leads; three companion figures
                support it. Never a uniform equal-size grid. */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:grid-rows-2">
              <div className="lg:col-span-1 lg:row-span-2">
                <StatPanel
                  size="hero"
                  label="Total Occupancy"
                  value={
                    <>
                      <NumberTicker value={data.summary.totalOccupied} />
                      <span className="mx-1 text-muted">/</span>
                      <NumberTicker value={data.summary.totalCapacity} />
                    </>
                  }
                  detail={`${data.summary.totalZones} zones reporting`}
                  trend={data.summary.occupancyPct >= 80 ? `${formatPct(data.summary.occupancyPct)} full` : undefined}
                  accent={data.summary.occupancyPct >= 100 ? "red" : data.summary.occupancyPct >= 80 ? "amber" : "info"}
                  icon={Gauge}
                  progressPct={data.summary.occupancyPct}
                />
              </div>
              <StatPanel
                label="Active Vehicles"
                value={<NumberTicker value={data.summary.activeSessions} />}
                detail="currently parked"
                accent="green"
                icon={CarFront}
              />
              <StatPanel
                label="Available Spaces"
                value={<NumberTicker value={data.summary.totalAvailable} />}
                detail="open spaces right now"
                accent={data.summary.totalAvailable === 0 ? "red" : "green"}
                icon={DoorOpen}
              />
              <div className="lg:col-span-2">
                <StatPanel
                  label="Camera Status"
                  value={`${data.summary.onlineCameras}/${data.summary.onlineCameras + data.summary.offlineCameras}`}
                  detail="gate cameras online"
                  accent={data.summary.offlineCameras > 0 ? "amber" : "green"}
                  icon={ShieldAlert}
                />
              </div>
            </div>

            {/* Occupancy trend + live alerts */}
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
              <Card>
                <SectionHeader title="Occupancy Trends" description="Last 24 hours" />
                <OccupancyTrendChart trend={data.trend} />
              </Card>
              <Card>
                <SectionHeader
                  title="Live Alerts"
                  actions={
                    <Link href="/anomalies" className="btn-ghost btn-sm">
                      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {(() => {
                  const alerts = buildAlertFeed(data.recentAnomalies, data.recentNotifications);
                  if (alerts.length === 0) {
                    return <p className="p-5 text-sm text-muted">No active alerts.</p>;
                  }
                  return (
                    <ul className="divide-y divide-line">
                      {alerts.map((item) => {
                        const tone = item.kind === "anomaly" ? "text-danger" : "text-warning";
                        const AlertIcon = item.kind === "anomaly" ? TriangleAlert : Bell;
                        const message =
                          item.kind === "anomaly"
                            ? `${item.anomaly.anomalyType.replace(/_/g, " ").toLowerCase()} in ${
                                item.anomaly.zoneCode ? `Zone ${item.anomaly.zoneCode}` : "an unassigned zone"
                              }`
                            : item.notification.message;
                        return (
                          <li key={item.id} className="flex gap-3 px-4 py-3">
                            <AlertIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="text-sm text-charcoal">{message}</p>
                              <p className="mt-1 text-[11px] font-semibold text-muted">{formatDateTime(item.createdAt)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </Card>
            </section>

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
                                entry ? "bg-success-soft text-success" : "bg-brand-soft text-brand-dark"
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

          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
