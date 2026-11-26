"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Ban, Bell, ChevronRight, LogIn, LogOut, Scale, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { ANOMALY_LABEL, AvailabilityBadge, PlateChip } from "@/components/ui/Badge";
import { FacilityStrip, MetricCard } from "@/components/ui/MetricCard";
import { OccupancyBar } from "@/components/ui/OccupancyBar";
import { formatTime, formatDateTime, formatPct, plural } from "@/lib/format";
import { EVENT_LABEL, SOURCE_LABEL, labelFor } from "@/lib/labels";
import type { AdminAnomaly, AdminDashboard, AdminNotification } from "@/lib/api/types";

/**
 * Facility-wide occupancy over the last 24h, from real `OccupancyHistory`
 * snapshots aggregated server-side (see `buildOccupancyTrend` in
 * services/api) — never a placeholder or synthetic series. One bar per
 * hourly point; the latest (now) bar is the one orange mark.
 */
function OccupancyTrendChart({ trend }: { trend: AdminDashboard["trend"] }) {
  if (trend.length === 0) {
    return <p className="px-5 pb-5 text-sm text-muted">No occupancy data yet.</p>;
  }

  const pct = trend.map((p) => (p.totalCapacity > 0 ? Math.min(100, (p.totalOccupied / p.totalCapacity) * 100) : 0));
  const current = pct[pct.length - 1] ?? 0;
  const first = trend[0];
  const last = trend[trend.length - 1];

  return (
    <div className="px-5 pb-5">
      <p className="text-3xl font-semibold tracking-[-0.025em] text-charcoal">
        {Math.round(current)}%
        <span className="ml-1.5 text-sm font-medium tracking-normal text-muted">occupied right now</span>
      </p>
      <div
        className="mt-5 flex h-40 items-end gap-1 border-b border-line"
        role="img"
        aria-label={`Hourly facility occupancy: ${Math.round(pct[0] ?? 0)}% at the start, ${Math.round(current)}% now`}
      >
        {pct.map((value, i) => (
          <span
            key={trend[i]!.at}
            className={`flex-1 rounded-t-[3px] ${i === pct.length - 1 ? "bg-brand" : "bg-raised2"}`}
            style={{ height: `${Math.max(2, value)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{first ? formatDateTime(first.at) : ""}</span>
        <span>{last ? `Now · ${formatTime(last.at)}` : ""}</span>
      </div>
    </div>
  );
}

/**
 * What an operator should act on now, from the dashboard payload alone: open
 * anomaly and pending appeal counts, and zones the backend reports FULL. Each
 * item links to the page where it is acted on. Nothing here is inferred.
 */
function NeedsAttention({
  openAnomalies,
  pendingAppeals,
  fullZones,
}: {
  openAnomalies: number;
  pendingAppeals: number;
  fullZones: AdminDashboard["fullZones"];
}) {
  const items: { key: string; href: string; text: string; sub: string; icon: LucideIcon; tone: string }[] = [];
  for (const zone of fullZones) {
    items.push({
      key: `full-${zone.id}`,
      href: `/zones/${zone.id}`,
      text: `${zone.name} is full`,
      sub: `Zone ${zone.code} · ${zone.occupiedCount} of ${zone.capacity}`,
      icon: Ban,
      tone: "bg-danger-soft text-danger",
    });
  }
  if (openAnomalies > 0) {
    items.push({
      key: "anomalies",
      href: "/anomalies",
      text: `${openAnomalies} unresolved ${openAnomalies === 1 ? "anomaly" : "anomalies"}`,
      sub: "Anomalies",
      icon: ShieldAlert,
      tone: "bg-warning-soft text-warning",
    });
  }
  if (pendingAppeals > 0) {
    items.push({
      key: "appeals",
      href: "/appeals",
      text: `${plural(pendingAppeals, "appeal")} awaiting a decision`,
      sub: "Appeals",
      icon: Scale,
      tone: "bg-brand-soft text-brand-ink",
    });
  }

  return (
    <Card>
      <SectionHeader
        title="Needs attention"
        actions={items.length > 0 ? <span className="text-xs text-muted">{plural(items.length, "item")}</span> : null}
      />
      {items.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-2 px-5 pb-5 pt-1" aria-live="polite">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex min-h-[56px] items-center gap-3 rounded-control bg-raised px-3 py-2.5 text-sm font-semibold text-charcoal transition-colors duration-100 hover:bg-raised2 focus-visible:outline-hidden focus-visible:shadow-focus"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-chip ${item.tone}`} aria-hidden="true">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  {item.text}
                  <span className="block text-xs font-medium text-muted">{item.sub}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-sm text-muted">Nothing needs attention.</p>
      )}
    </Card>
  );
}

type ActivityItem =
  | { kind: "anomaly"; id: string; at: string; anomaly: AdminAnomaly }
  | { kind: "notification"; id: string; at: string; notification: AdminNotification }
  | { kind: "gate"; id: string; at: string; event: AdminDashboard["recentEvents"][number] };

/** Merges the latest anomalies, notifications and gate events (the backend
 * returns the newest of each, resolved/read or not — services/api/src/routes/admin.ts)
 * into one time-sorted feed. It refetches when the realtime stream reports a
 * change, so it is "recent", never a claim of live history. Resolved anomalies say so. */
function buildActivity(data: AdminDashboard): ActivityItem[] {
  const items: ActivityItem[] = [
    ...data.recentAnomalies.map((a) => ({ kind: "anomaly" as const, id: `a-${a.id}`, at: a.createdAt, anomaly: a })),
    ...data.recentNotifications.map((n) => ({ kind: "notification" as const, id: `n-${n.id}`, at: n.createdAt, notification: n })),
    ...data.recentEvents.map((e) => ({ kind: "gate" as const, id: `e-${e.id}`, at: e.detectedAt, event: e })),
  ];
  return items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()).slice(0, 8);
}

function ActivityRow({ item, zoneCode }: { item: ActivityItem; zoneCode: (zoneId: string) => string | null }) {
  let Icon: LucideIcon = Bell;
  let tone = "bg-raised text-muted";
  let title: React.ReactNode;
  let sub: string;
  let kindLabel: string;
  if (item.kind === "gate") {
    Icon = item.event.eventType === "ENTRY" ? LogIn : LogOut;
    kindLabel = "Gate event: ";
    title = <span className="font-mono">{item.event.detectedPlate ?? "Unknown plate"}</span>;
    sub = `${labelFor(EVENT_LABEL, item.event.eventType)} · ${labelFor(SOURCE_LABEL, item.event.source)}`;
  } else if (item.kind === "anomaly") {
    Icon = TriangleAlert;
    tone = item.anomaly.resolved ? "bg-raised text-muted" : "bg-danger-soft text-danger";
    kindLabel = "Anomaly: ";
    title = `${ANOMALY_LABEL[item.anomaly.anomalyType] ?? item.anomaly.anomalyType} in ${
      item.anomaly.zoneCode ? `Zone ${item.anomaly.zoneCode}` : "an unassigned zone"
    }`;
    sub = `${formatDateTime(item.at)}${item.anomaly.resolved ? " · Resolved" : ""}`;
  } else {
    tone = "bg-warning-soft text-warning";
    kindLabel = "Notification: ";
    title = item.notification.message;
    sub = formatDateTime(item.at);
  }
  const code = item.kind === "gate" ? zoneCode(item.event.zoneId) : null;

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-chip ${tone}`} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-charcoal">
          <span className="sr-only">{kindLabel}</span>
          {title}
        </p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
      {item.kind === "gate" ? (
        <span className="shrink-0 text-right font-mono text-xs text-muted">
          {code ? <span className="block">Zone {code}</span> : null}
          {formatTime(item.at)}
        </span>
      ) : (
        <span />
      )}
    </li>
  );
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
  const zoneCode = (zoneId: string) => data?.zones.find((z) => z.id === zoneId)?.code ?? null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={dashboard.dataUpdatedAt ? `Updated ${formatTime(dashboard.dataUpdatedAt)}` : undefined}
      />

      <QueryBoundary
        status={dashboard.status}
        error={dashboard.error}
        loadingRows={4}
        onRetry={() => dashboard.refetch()}
      >
        {data ? (
          <div className="space-y-3">
            <NeedsAttention
              openAnomalies={data.summary.openAnomalies}
              pendingAppeals={data.summary.pendingAppeals}
              fullZones={data.fullZones}
            />

            {/* One figure component for every number (MetricCard in a strip). */}
            <FacilityStrip label="Facility figures">
              <MetricCard
                label="Occupied"
                value={`${data.summary.totalOccupied} / ${data.summary.totalCapacity}`}
                detail={`${formatPct(data.summary.occupancyPct)} of ${plural(activeZones, "active zone")}`}
                accent={data.summary.occupancyPct >= 100 ? "red" : "none"}
                meter={{ pct: data.summary.occupancyPct, tone: data.summary.occupancyPct >= 100 ? "full" : "live" }}
              />
              <MetricCard label="Parked now" value={data.summary.activeSessions} detail="active sessions" />
              <MetricCard
                label="Free spaces"
                value={data.summary.totalAvailable}
                accent={data.summary.totalAvailable === 0 ? "red" : "none"}
                detail={data.summary.totalAvailable === 0 ? "every zone is full" : "across zones with room"}
                meter={{
                  pct: data.summary.totalCapacity > 0 ? (data.summary.totalAvailable / data.summary.totalCapacity) * 100 : 0,
                }}
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
                meter={
                  totalCameras > 0 && totalCameras <= 24
                    ? { pct: (data.summary.onlineCameras / totalCameras) * 100, ticks: totalCameras }
                    : undefined
                }
              />
            </FacilityStrip>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
              <Card>
                <SectionHeader title="Occupancy · last 24 hours" description="Hourly, all zones" />
                <OccupancyTrendChart trend={data.trend} />
              </Card>
              <Card>
                <SectionHeader
                  title="Activity"
                  description="Gate events and alerts, newest first"
                  actions={
                    <Link href="/sessions" className="btn-ghost btn-sm -my-2">
                      Sessions <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {(() => {
                  const activity = buildActivity(data);
                  if (activity.length === 0) {
                    return <p className="px-5 pb-5 text-sm text-muted">No recent activity.</p>;
                  }
                  return (
                    <ul className="divide-y divide-line px-5 pb-2">
                      {activity.map((item) => (
                        <ActivityRow key={item.id} item={item} zoneCode={zoneCode} />
                      ))}
                    </ul>
                  );
                })()}
              </Card>
            </section>

            {/* Zone rows: occupancy once — count and meter; status only when it is not "Available". */}
            <Card>
              <SectionHeader
                title="Zones"
                actions={
                  <Link href="/zones" className="btn-ghost btn-sm -my-2">
                    Manage zones <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                }
              />
              {data.zones.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">No zones configured yet.</p>
              ) : (
                <ul className="divide-y divide-line px-3 pb-3">
                  {data.zones.map((z) => (
                    <li key={z.id}>
                      <Link
                        href={`/zones/${z.id}`}
                        className="grid min-h-[56px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-control px-2 py-2.5 transition-colors duration-100 hover:bg-raised focus-visible:outline-hidden focus-visible:shadow-focus md:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,2fr)_5.5rem_7rem]"
                      >
                        <PlateChip>{z.code}</PlateChip>
                        <span className="min-w-0 truncate text-sm font-semibold text-charcoal">{z.name}</span>
                        <span className="text-right text-base font-semibold tabular-nums text-charcoal md:order-4">
                          {z.occupiedCount}
                          <span className="text-sm font-medium text-muted"> / {z.capacity}</span>
                        </span>
                        <span className="col-span-3 md:order-3 md:col-span-1">
                          <OccupancyBar pct={z.occupancyPct} availability={z.availability} />
                        </span>
                        <span className="col-span-3 flex md:order-5 md:col-span-1 md:justify-end">
                          {z.availability !== "AVAILABLE" ? <AvailabilityBadge value={z.availability} /> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
