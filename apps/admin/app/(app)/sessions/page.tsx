"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";
import { formatDate, formatDuration } from "@/lib/format";

export default function SessionsPage() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions(),
    refetchInterval: 30_000,
  });

  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "COMPLETED">("ALL");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = sessions.data ?? [];
    return list.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [
          s.vehicle?.plateNumber,
          s.zone?.code,
          s.user?.email,
          s.user?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sessions.data, statusFilter, search]);

  return (
    <div>
      <PageHeader title="Parking Sessions" description="User, vehicle, license plate, zone and timing." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-md border border-slate-300 bg-white p-1">
          {(["ALL", "ACTIVE", "COMPLETED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={`rounded px-3 py-1 text-sm font-medium ${
                statusFilter === s ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <label htmlFor="session-search" className="sr-only">
          Search sessions
        </label>
        <input
          id="session-search"
          type="search"
          placeholder="Search plate, zone, user…"
          className="input sm:w-72"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <QueryBoundary
        status={sessions.status}
        error={sessions.error}
        isEmpty={filtered.length === 0}
        emptyTitle={sessions.data && sessions.data.length > 0 ? "No sessions match your filters." : "No parking sessions."}
        emptyMessage={sessions.data && sessions.data.length > 0 ? "Try adjusting the search or status filter." : "No parking sessions have been recorded."}
        loadingRows={5}
      >
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>User</th>
                <th>Vehicle / Plate</th>
                <th>Zone</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium text-slate-800">{s.user?.name}</div>
                    <div className="text-xs text-slate-500">{s.user?.email}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-800">
                        {s.vehicle?.plateNumber ?? "—"}
                      </span>
                      <Pill tone="slate">{s.vehicle?.vehicleType ?? "—"}</Pill>
                    </div>
                  </td>
                  <td className="text-slate-600">{s.zone?.code}</td>
                  <td className="text-slate-600">{formatDate(s.entryEvent?.detectedAt)}</td>
                  <td className="text-slate-600">
                    {s.status === "ACTIVE" ? (
                      <span className="text-slate-400">In progress</span>
                    ) : (
                      formatDate(s.exitEvent?.detectedAt)
                    )}
                  </td>
                  <td className="text-slate-600">{formatDuration(s.durationSeconds)}</td>
                  <td>
                    <Pill tone={s.status === "ACTIVE" ? "green" : "slate"}>{s.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryBoundary>
    </div>
  );
}
