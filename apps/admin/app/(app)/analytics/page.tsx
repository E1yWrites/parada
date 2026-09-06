"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { StatCard } from "@/components/ui/Badge";

export default function AnalyticsPage() {
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics(), refetchInterval: 60_000 });

  return (
    <div>
      <PageHeader
        eyebrow="Operations · Persisted metrics"
        title="Analytics"
        description="Operational aggregates calculated from recorded parking events, sessions, fees, reservations, and violations."
      />
      <QueryBoundary status={analytics.status} error={analytics.error} isEmpty={!analytics.data} emptyTitle="No analytics data." loadingRows={5} onRetry={() => analytics.refetch()}>
        {analytics.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
              <StatCard label="Current occupancy" value={`${analytics.data.current.occupied} / ${analytics.data.current.capacity}`} detail="All zones" />
              <StatCard label="Sessions" value={analytics.data.sessions.total} detail={`${analytics.data.sessions.active} active`} />
              <StatCard label="Revenue" value={`₱${analytics.data.revenue.total.toFixed(2)}`} detail={`${analytics.data.revenue.fees} fee records`} />
              <StatCard label="Violations" value={analytics.data.violations} detail={`${analytics.data.reservations} reservations`} />
            </div>

            <Card>
              <SectionHeader eyebrow="Per zone" title="Zone performance" />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {analytics.data.zones.map((zone) => {
                  const pct = zone.capacity > 0 ? Math.round((zone.occupiedCount / zone.capacity) * 100) : 0;
                  return (
                    <div key={zone.id} className="surface-panel px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-charcoal">Zone {zone.code}</p>
                        <p className="font-display text-sm font-black text-charcoal">
                          {zone.occupiedCount} / {zone.capacity}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="occupancy-bar flex-1">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? "bg-brand" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <p className="ml-3 text-[11px] font-bold uppercase tracking-wider text-muted">{zone.availableCount} open</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <SectionHeader eyebrow="Utilization" title="Session activity" />
              <p className="p-5 text-sm text-muted">
                Average duration: <span className="font-bold text-charcoal">{Math.round(analytics.data.sessions.averageDurationSeconds / 60)} minutes</span>.
                {" "}
                {analytics.data.peakEntryHour ? (
                  <>Peak entry hour: <span className="font-bold text-charcoal">{String(analytics.data.peakEntryHour.hour).padStart(2, "0")}:00</span>.</>
                ) : (
                  "No peak hour recorded."
                )}
              </p>
            </Card>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}