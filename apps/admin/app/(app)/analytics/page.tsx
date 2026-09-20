"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { PlateChip, StatCard } from "@/components/ui/Badge";
import { FacilityStrip } from "@/components/ui/MetricCard";

export default function AnalyticsPage() {
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics(), refetchInterval: 60_000 });

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Aggregates computed from recorded parking events, sessions, fees, reservations and violations."
      />
      <QueryBoundary status={analytics.status} error={analytics.error} isEmpty={!analytics.data} emptyTitle="No analytics data." loadingRows={5} onRetry={() => analytics.refetch()}>
        {analytics.data ? (
          <div className="space-y-6">
            <FacilityStrip label="Facility totals">
              <StatCard label="Current occupancy" value={`${analytics.data.current.occupied} / ${analytics.data.current.capacity}`} detail="All zones" />
              <StatCard label="Sessions" value={analytics.data.sessions.total} detail={`${analytics.data.sessions.active} active now`} tone="info" />
              <StatCard label="Revenue" value={`₱${analytics.data.revenue.total.toFixed(2)}`} detail={`${analytics.data.revenue.fees} fee records`} tone="success" />
              <StatCard label="Violations" value={analytics.data.violations} detail={`${analytics.data.reservations} reservations`} tone={analytics.data.violations > 0 ? "warn" : "neutral"} />
            </FacilityStrip>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
              <Card>
                <SectionHeader title="Zone occupancy" description="Current count against capacity, per zone" />
                <ul className="divide-y divide-line">
                  {analytics.data.zones.map((zone) => {
                    const pct = zone.capacity > 0 ? Math.round((zone.occupiedCount / zone.capacity) * 100) : 0;
                    const fill = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success";
                    return (
                      <li key={zone.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3">
                        <PlateChip>{zone.code}</PlateChip>
                        <div className="min-w-0">
                          <div className="occupancy-bar" aria-hidden="true">
                            <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <p className="mt-1.5 text-[11px] font-semibold text-muted">{zone.availableCount} open · {pct}%</p>
                        </div>
                        <p className="font-display text-sm font-black tabular-nums text-charcoal">
                          {zone.occupiedCount} <span className="font-bold text-muted">/ {zone.capacity}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card>
                <SectionHeader title="Session activity" description="From completed sessions" />
                <dl className="divide-y divide-line px-5">
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <dt className="text-sm text-muted">Average duration</dt>
                    <dd className="font-display text-base font-black tabular-nums text-charcoal">
                      {Math.round(analytics.data.sessions.averageDurationSeconds / 60)} min
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <dt className="text-sm text-muted">Peak entry hour</dt>
                    <dd className="font-display text-base font-black tabular-nums text-charcoal">
                      {analytics.data.peakEntryHour
                        ? `${String(analytics.data.peakEntryHour.hour).padStart(2, "0")}:00`
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <dt className="text-sm text-muted">Active sessions</dt>
                    <dd className="font-display text-base font-black tabular-nums text-charcoal">{analytics.data.sessions.active}</dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}