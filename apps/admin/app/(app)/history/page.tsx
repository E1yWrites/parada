"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
  });

  const initialZone = searchParams.get("zone") ?? "";
  const [zoneId, setZoneId] = useState(initialZone);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    const z = searchParams.get("zone");
    if (z) setZoneId(z);
  }, [searchParams]);

  const history = useQuery({
    queryKey: ["history", zoneId, from, to, limit],
    queryFn: () =>
      api.history(zoneId, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        limit,
      }),
    enabled: Boolean(zoneId),
  });

  const zone = zones.data?.find((z) => z.id === zoneId);

  const maxOccupied = zone?.capacity ?? 0;

  return (
    <div>
      <PageHeader title="Occupancy History" description="Occupancy snapshots over time for a selected zone." />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="history-zone" className="label">
            Zone
          </label>
          <select
            id="history-zone"
            className="input"
            value={zoneId}
            onChange={(e) => {
              setZoneId(e.target.value);
              if (e.target.value) {
                const p = new URLSearchParams(searchParams.toString());
                p.set("zone", e.target.value);
                router.replace(`/history?${p.toString()}`);
              }
            }}
          >
            <option value="">Select a zone…</option>
            {zones.data?.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} — {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="history-from" className="label">
            From
          </label>
          <input
            id="history-from"
            type="datetime-local"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="history-to" className="label">
            To
          </label>
          <input
            id="history-to"
            type="datetime-local"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="history-limit" className="label">
            Max records
          </label>
          <select
            id="history-limit"
            className="input"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[50, 100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!zoneId ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Select a zone to view occupancy history.
        </div>
      ) : (
        <QueryBoundary
          status={history.status}
          error={history.error}
          isEmpty={history.data?.entries.length === 0}
          emptyTitle="No occupancy history for the selected range."
          emptyMessage="Try widening the time range or selecting a different zone."
          loadingRows={5}
        >
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Occupied</th>
                  <th>Available</th>
                  <th>Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="text-slate-600">{formatDate(e.occurredAt)}</td>
                    <td className="font-medium text-slate-800">{e.occupiedCount}</td>
                    <td className="text-slate-600">{e.availableCount}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-brand-600"
                            style={{
                              width: `${maxOccupied > 0 ? (e.occupiedCount / maxOccupied) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {maxOccupied > 0 ? Math.round((e.occupiedCount / maxOccupied) * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
              Showing up to {history.data?.limit ?? "—"} records
              {history.data?.zone ? ` for ${history.data.zone.code}` : ""}.
            </p>
          </div>
        </QueryBoundary>
      )}
    </div>
  );
}
