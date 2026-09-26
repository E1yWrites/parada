"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, LogIn, LogOut, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { ANOMALY_LABEL, AvailabilityBadge, PlateChip } from "@/components/ui/Badge";
import { FacilityStrip, MetricCard } from "@/components/ui/MetricCard";
import { OccupancyBar } from "@/components/ui/OccupancyBar";
import { formatDate, formatDateTime, formatPct, plural } from "@/lib/format";
import { EVENT_LABEL, SOURCE_LABEL, labelFor } from "@/lib/labels";
import type { AdminAnomaly, AdminDashboard, AdminNotification } from "@/lib/api/types";

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
      <div className="mt-2 flex items-center justify-between text-micro font-semibold text-muted">
        <span>{first ? formatDateTime(first.at) : ""}</span>
        <span>{last ? formatDateTime(last.at) : ""}</span>
      </div>
    </div>
  );
}

/**
 * What an operator should act on now, from existing endpoints only: open
 * anomalies (GET /admin/anomalies?resolved=false), appeals awaiting a
 * decision, and zones the backend reports FULL. Each item links to the page
 * where it is acted on. Nothing here is inferred or simulated.
 */
function NeedsAttention({ fullZones }: { fullZones: AdminDashboard["fullZones"] }) {
  const anomalies = useQuery({
    queryKey: ["anomalies", "unresolved"],
    queryFn: () => api.unresolvedAnomalies(),
    refetchInterval: 30_000,
  });
  const appeals = useQuery({ queryKey: ["appeals"], queryFn: () => api.appeals(), refetchInterval: 30_000 });

  const openAnomalies = anomalies.data?.length ?? 0;
  const pendingAppeals = appeals.data?.filter((a) => a.status === "PENDING").length ?? 0;
  const settled = anomalies.status !== "pending" && appeals.status !== "pending";

  const items: { key: string; href: string; text: string }[] = [];
  if (openAnomalies > 0) {
    items.push({
      key: "anomalies",
      href: "/anomalies",
      text: `${openAnomalies >= 500 ? "500+" : openAnomalies} unresolved ${openAnomalies === 1 ? "anomaly" : "anomalies"}`,
    });
  }
  if (pendingAppeals > 0) {
    items.push({ key: "appeals", href: "/appeals", text: `${plural(pendingAppeals, "appeal")} awaiting a decision` });
  }
  for (const zone of fullZones) {
    items.push({ key: `full-${zone.id}`, href: `/zones/${zone.id}`, text: `${zone.name} is full` });
  }

  return (
    <Card>
      <SectionHeader title="Needs attention" />
      {items.length > 0 ? (
        <ul className="divide-y divide-line" aria-live="polite">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex min-h-[44px] items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-charcoal transition-colors duration-100 hover:bg-raised/60 focus-visible:outline-none focus-visible:shadow-focus"
              >
                <span className="flex items-center gap-3">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  {item.text}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : settled ? (
        <p className="p-5 text-sm text-muted">Nothing needs attention.</p>
      ) : (
        <p className="p-5 text-sm text-muted">Checking…</p>
      )}
      {anomalies.isError || appeals.isError ? (
        <p role="alert" className="border-t border-line px-5 py-3 text-xs font-semibold text-danger">
          {anomalies.isError ? "Couldn't load anomalies. " : ""}
          {appeals.isError ? "Couldn't load appeals." : ""}
        </p>
      ) : null}
    </Card>
  );
}

type AlertItem =
  | { kind: "anomaly"; id: string; createdAt: string; anomaly: AdminAnomaly }
  | { kind: "notification"; id: string; createdAt: string; notification: AdminNotification };

/** Merges the latest anomalies + notifications (both genuine alert-shaped
 * records) into one time-sorted feed. The backend returns the newest 8 of each
 * whether resolved/read or not (services/api/src/routes/admin.ts), so this is
 * "Recent alerts", not "active" ones — resolved anomalies are labelled as such.
 * Entry/exit events are left out — they aren't anomalous. */
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
  // "zones reporting" used to count every zone, including INACTIVE ones.
  const activeZones = data ? data.zones.filter((z) => z.status === "ACTIVE").length : 0;
  const totalCameras = data ? data.summary.onlineCameras + data.summary.offlineCameras : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={dashboard.dataUpdatedAt ? `Updated ${formatDate(dashboard.dataUpdatedAt)}` : undefined}
      />

      <QueryBoundary
        status={dashboard.status}
        error={dashboard.error}
        loadingRows={4}
        onRetry={() => dashboard.refetch()}
      >
        {data ? (
          <div className="space-y-6">
            <NeedsAttention fullZones={data.fullZones} />

            {/* One figure component for every number (MetricCard in a strip). */}
            <FacilityStrip label="Facility figures">
              <MetricCard
                label="Occupied"
                value={`${data.summary.totalOccupied} / ${data.summary.totalCapacity}`}
                detail={`${formatPct(data.summary.occupancyPct)} of ${plural(activeZones, "active zone")}`}
                accent={data.summary.occupancyPct >= 100 ? "red" : data.summary.occupancyPct >= 80 ? "amber" : "none"}
              />
              <MetricCard label="Parked now" value={data.summary.activeSessions} detail="active sessions" />
              <MetricCard
                label="Free spaces"
                value={data.summary.totalAvailable}
                accent={data.summary.totalAvailable === 0 ? "red" : "none"}
              />
              {/* ONLINE/OFFLINE is an admin on/off switch (zoneConfig.ts), not a
                  health signal — there is no camera heartbeat — so this says
                  "enabled", never "online". */}
              <MetricCard
                label="Cameras enabled"
                value={`${data.summary.onlineCameras}/${totalCameras}`}
                detail={
                  data.summary.offlineCameras > 0
                    ? `${data.summary.offlineCameras} disabled — those gates do not count`
                    : "all gate cameras switched on"
                }
                accent={data.summary.offlineCameras > 0 ? "amber" : "none"}
              />
            </FacilityStrip>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
              <Card>
                <SectionHeader title="Occupancy trend" description="Last 24 hours" />
                <OccupancyTrendChart trend={data.trend} />
              </Card>
              <Card>
                <SectionHeader
                  title="Recent alerts"
                  actions={
                    <Link href="/anomalies" className="btn-ghost btn-sm">
                      Anomalies <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {(() => {
                  const alerts = buildAlertFeed(data.recentAnomalies, data.recentNotifications);
                  if (alerts.length === 0) {
                    return <p className="p-5 text-sm text-muted">No recent alerts.</p>;
                  }
                  return (
                    <ul className="divide-y divide-line">
                      {alerts.map((item) => {
                        const tone = item.kind === "anomaly" ? "text-danger" : "text-warning";
                        const AlertIcon = item.kind === "anomaly" ? TriangleAlert : Bell;
                        const message =
                          item.kind === "anomaly"
                            ? `${ANOMALY_LABEL[item.anomaly.anomalyType] ?? item.anomaly.anomalyType} in ${
                                item.anomaly.zoneCode ? `Zone ${item.anomaly.zoneCode}` : "an unassigned zone"
                              }`
                            : item.notification.message;
                        const resolved = item.kind === "anomaly" && item.anomaly.resolved;
                        return (
                          <li key={item.id} className="flex gap-3 px-4 py-3">
                            <AlertIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                            <div className="min-w-0">
                              {/* Kind in words, not only by icon and colour. */}
                              <p className="text-sm text-charcoal">
                                <span className="sr-only">{item.kind === "anomaly" ? "Anomaly: " : "Notification: "}</span>
                                {message}
                              </p>
                              <p className="mt-1 text-micro font-semibold text-muted">
                                {formatDateTime(item.createdAt)}
                                {resolved ? " · Resolved" : null}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </Card>
            </section>

            {/* Zone rows: occupancy once — count and bar; status only when it is not "Available". */}
            <Card>
              <SectionHeader
                title="Zones"
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
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors duration-100 hover:bg-raised/60 focus-visible:outline-none focus-visible:bg-raised focus-visible:shadow-focus sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(8rem,1fr)_auto]"
                      >
                        <PlateChip>{z.code}</PlateChip>
                        <span className="min-w-0 truncate text-sm font-bold text-charcoal">{z.name}</span>
                        <span className="font-display text-lg font-black tabular-nums text-charcoal sm:order-4">
                          {z.occupiedCount}
                          <span className="text-sm font-bold text-muted"> / {z.capacity}</span>
                        </span>
                        <span className="col-span-3 flex items-center gap-3 sm:order-3 sm:col-span-1">
                          <span className="min-w-0 flex-1">
                            <OccupancyBar pct={z.occupancyPct} availability={z.availability} />
                          </span>
                          {z.availability !== "AVAILABLE" ? <AvailabilityBadge value={z.availability} /> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <SectionHeader
                title="Recent gate events"
                actions={
                  <Link href="/sessions" className="btn-ghost btn-sm">
                    Sessions <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                }
              />
              {data.recentEvents.length === 0 ? (
                <p className="p-5 text-sm text-muted">No recent gate events.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recentEvents.map((ev) => {
                    const entry = ev.eventType === "ENTRY";
                    const Icon = entry ? LogIn : LogOut;
                    return (
                      <li key={ev.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Icon className={`h-4 w-4 shrink-0 ${entry ? "text-success" : "text-brand-ink"}`} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-charcoal">{ev.detectedPlate ?? "Unknown plate"}</p>
                            <p className="text-micro font-semibold text-muted">
                              {labelFor(EVENT_LABEL, ev.eventType)} · {labelFor(SOURCE_LABEL, ev.source)}
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
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
