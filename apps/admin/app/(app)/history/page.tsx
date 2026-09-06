"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { DataTable, type Column } from "@/components/ui/DataTable";
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
      cell: (e) => <span className="font-display text-sm font-bold text-muted">{formatDateTime(e.occurredAt)}</span>,
    },
    {
      key: "occupied",
      header: "Occupied",
      cell: (e) => <span className="font-display text-sm font-black text-charcoal">{e.occupiedCount}</span>,
    },
    {
      key: "available",
      header: "Available",
      cell: (e) => <span className="font-display text-sm font-bold text-muted">{e.availableCount}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Management · Telemetry"
        title="Occupancy History"
        description="Parking occupancy over time."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="hist-zone" className="label">
            Zone
          </label>
          <select
            id="hist-zone"
            className="input mt-1.5 w-56"
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
            className="input mt-1.5"
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
            className="input mt-1.5"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary" onClick={applyRange}>
          Apply
        </button>
      </div>

      {!zoneId ? (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-graygreen/25 text-muted" aria-hidden="true">
            <Inbox className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-display text-lg font-black tracking-tight text-charcoal">Select a zone</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Choose a zone to view its occupancy history.
          </p>
        </Card>
      ) : (
        <QueryBoundary
          status={history.status}
          error={history.error}
          isEmpty={!history.data}
          loadingRows={5}
          onRetry={() => history.refetch()}
        >
          {!history.data || history.data.entries.length === 0 ? (
            <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-graygreen/25 text-muted" aria-hidden="true">
                <Inbox className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-lg font-black tracking-tight text-charcoal">
                No occupancy history
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {history.isFetching || navigating
                  ? "Loading…"
                  : "No occupancy history for this period."}
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              <ZoneTimeline data={history.data} />
              <DataTable columns={columns} rows={history.data.entries} rowKey={(e) => `${e.occurredAt}-${e.id}`} />
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
      <SectionHeader eyebrow={selectedZoneLabel(data)} title="Parking Occupancy Over Time" />
      <div className="p-5">
        <div className="flex h-32 items-end gap-[2px] overflow-x-auto">
          {entries.map((e) => {
            const h = Math.max(2, (e.occupiedCount / capacity) * 100);
            return (
              <div
                key={e.id}
                title={`${formatDateTime(e.occurredAt)} · ${e.occupiedCount}/${capacity}`}
                className="min-w-[3px] flex-1 rounded-sm bg-brand/60 transition-colors duration-200 hover:bg-brand"
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
          <span className="font-display font-bold">{formatDateTime(entries[0]?.occurredAt)}</span>
          <span className="label-tech">Capacity {data.zone.capacity}</span>
          <span className="font-display font-bold">{formatDateTime(entries[entries.length - 1]?.occurredAt)}</span>
        </div>
      </div>
    </Card>
  );
}

function selectedZoneLabel(data: ZoneHistory) {
  return `Zone ${data.zone.code}`;
}