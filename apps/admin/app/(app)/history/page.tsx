"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/State";
import { PlateChip } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { ZoneHistory } from "@/lib/api/types";

export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
  });

  const zoneId = searchParams.get("zone") ?? "";
  const [navigating, setNavigating] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (searchParams.get("from")) setFrom(String(searchParams.get("from")).slice(0, 16));
    if (searchParams.get("to")) setTo(String(searchParams.get("to")).slice(0, 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const history = useQuery({
    queryKey: ["history", zoneId, from, to, 200],
    queryFn: () =>
      api.history(zoneId, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        limit: 200,
      }),
    enabled: !!zoneId,
  });

  function updateZone(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("zone", id);
    else params.delete("zone");
    router.replace(`/history?${params.toString()}`);
  }

  function applyRange() {
    setNavigating(true);
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", new Date(from).toISOString());
    else params.delete("from");
    if (to) params.set("to", new Date(to).toISOString());
    else params.delete("to");
    router.replace(`/history?${params.toString()}`);
    setTimeout(() => setNavigating(false), 50);
  }

  const columns: Column<{ occurredAt: string; occupiedCount: number; availableCount: number }>[] = [
    {
      key: "ts",
      header: "Timestamp",
      cell: (e) => <span className="font-mono text-xs font-semibold text-muted">{formatDateTime(e.occurredAt)}</span>,
    },
    {
      key: "occupied",
      header: "Occupied",
      cell: (e) => <span className="font-display text-sm font-black tabular-nums text-charcoal">{e.occupiedCount}</span>,
    },
    {
      key: "available",
      header: "Available",
      cell: (e) => <span className="font-display text-sm font-bold tabular-nums text-muted">{e.availableCount}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title="Occupancy History" description="Recorded zone occupancy over time." />

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-60">
          <label htmlFor="hist-zone" className="label">
            Zone
          </label>
          <select
            id="hist-zone"
            className="input"
            value={zoneId}
            onChange={(e) => updateZone(e.target.value)}
          >
            <option value="">Select a zone…</option>
            {zones.data?.map((z) => (
              <option key={z.id} value={z.id}>
                Zone {z.code} — {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hist-from" className="label">
            From
          </label>
          <input
            id="hist-from"
            type="datetime-local"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="hist-to" className="label">
            To
          </label>
          <input
            id="hist-to"
            type="datetime-local"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary" onClick={applyRange}>
          Apply
        </button>
      </div>

      {!zoneId ? (
        <EmptyState icon={Clock3} title="Select a zone" message="Choose a zone above to view its occupancy history." />
      ) : (
        <QueryBoundary
          status={history.status}
          error={history.error}
          isEmpty={!history.data}
          loadingRows={5}
          onRetry={() => history.refetch()}
        >
          {!history.data || history.data.entries.length === 0 ? (
            <EmptyState
              mascot="history"
              title="No occupancy history"
              message={history.isFetching || navigating ? "Loading…" : "No occupancy history for this period."}
            />
          ) : (
            <div className="space-y-6">
              <ZoneTimeline data={history.data} />
              <DataTable
                columns={columns}
                rows={history.data.entries}
                rowKey={(e) => `${e.occurredAt}-${e.id}`}
                caption="Occupancy history entries"
              />
            </div>
          )}
        </QueryBoundary>
      )}
    </div>
  );
}

function ZoneTimeline({ data }: { data: ZoneHistory }) {
  const entries = data.entries;
  const capacity = data.zone.capacity || 1;
  return (
    <Card>
      <SectionHeader
        title="Occupancy over time"
        description={`${entries.length} recorded points · capacity ${data.zone.capacity}`}
        actions={<PlateChip>{selectedZoneLabel(data)}</PlateChip>}
      />
      <div className="p-5">
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden="true" />
          <div className="flex h-36 items-end gap-[2px] overflow-x-auto" aria-label="Occupancy chart">
            {entries.map((e) => {
              const ratio = e.occupiedCount / capacity;
              const h = Math.max(2, ratio * 100);
              const fill = ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-brand";
              return (
                <div
                  key={e.id}
                  title={`${formatDateTime(e.occurredAt)} · ${e.occupiedCount}/${capacity}`}
                  className={`min-w-[3px] flex-1 rounded-t-sm ${fill} opacity-75 transition-opacity duration-150 hover:opacity-100`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-micro font-semibold text-muted">
          <span>{formatDateTime(entries[0]?.occurredAt)}</span>
          <span>{formatDateTime(entries[entries.length - 1]?.occurredAt)}</span>
        </div>
      </div>
    </Card>
  );
}

function selectedZoneLabel(data: ZoneHistory) {
  return data.zone.code;
}