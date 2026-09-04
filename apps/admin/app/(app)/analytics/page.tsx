"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { StatCard } from "@/components/ui/Badge";

export default function AnalyticsPage() {
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics(), refetchInterval: 60_000 });
  return <div><PageHeader eyebrow="Operations · Persisted metrics" title="Analytics" description="Operational aggregates calculated from recorded parking events, sessions, fees, reservations, and violations." /><QueryBoundary status={analytics.status} error={analytics.error} isEmpty={!analytics.data} emptyTitle="No analytics data." loadingRows={5} onRetry={() => analytics.refetch()}>{analytics.data ? <div className="space-y-6"><div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><StatCard label="Current occupancy" value={`${analytics.data.current.occupied} / ${analytics.data.current.capacity}`} detail="All zones" /><StatCard label="Sessions" value={analytics.data.sessions.total} detail={`${analytics.data.sessions.active} active`} /><StatCard label="Revenue" value={`₱${analytics.data.revenue.total.toFixed(2)}`} detail={`${analytics.data.revenue.fees} fee records`} /><StatCard label="Violations" value={analytics.data.violations} detail={`${analytics.data.reservations} reservations`} /></div><Card className="p-5"><h2 className="font-display text-base font-semibold text-white">Zone performance</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{analytics.data.zones.map((zone) => <div key={zone.id} className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3"><span className="text-sm text-white">Zone {zone.code}</span><span className="font-mono text-sm text-muted">{zone.occupiedCount} / {zone.capacity} · {zone.availableCount} open</span></div>)}</div></Card><Card className="p-5"><h2 className="font-display text-base font-semibold text-white">Session activity</h2><p className="mt-2 text-sm text-muted">Average duration: {Math.round(analytics.data.sessions.averageDurationSeconds / 60)} minutes. {analytics.data.peakEntryHour ? `Peak entry hour: ${String(analytics.data.peakEntryHour.hour).padStart(2, "0")}:00.` : "No peak hour recorded."}</p></Card></div> : null}</QueryBoundary></div>;
}
