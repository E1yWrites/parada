"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { SessionStatusBadge } from "@/components/ui/Badge";
import { formatDuration } from "@/lib/format";
import type { AdminSession, ParkingSessionStatus } from "@/lib/api/types";

type Filter = "ALL" | ParkingSessionStatus;

export default function SessionsPage() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions(),
    refetchInterval: 30_000,
  });

  const rows = (sessions.data ?? []).filter((s) => {
    if (filter !== "ALL" && s.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      s.vehicle.plateNumber.toLowerCase().includes(q) ||
      s.user.name.toLowerCase().includes(q) ||
      s.zone.code.toLowerCase().includes(q)
    );
  });

  const columns: Column<AdminSession>[] = [
    {
      key: "plate",
      header: "License Plate",
      cell: (s) => (
        <div>
          <p className="font-mono text-sm font-bold tracking-tight text-white">{s.vehicle.plateNumber}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted">{s.vehicle.vehicleType}</p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (s) => (
        <div>
          <p className="text-sm text-white">{s.user.name}</p>
          <p className="text-[11px] text-muted">{s.user.email}</p>
        </div>
      ),
    },
    { key: "zone", header: "Zone", cell: (s) => <span className="text-sm text-muted">{s.zone.code}</span> },
    {
      key: "entry",
      header: "Entry",
      cell: (s) => (
        <span className="font-mono text-xs text-white">{new Date(s.enteredAt).toLocaleTimeString()}</span>
      ),
    },
    {
      key: "exit",
      header: "Exit",
      cell: (s) =>
        s.exitedAt ? (
          <span className="font-mono text-xs text-white">{new Date(s.exitedAt).toLocaleTimeString()}</span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: "duration",
      header: "Duration",
      cell: (s) => <span className="font-mono text-xs text-white">{formatDuration(s.durationSeconds)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => <SessionStatusBadge status={s.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Parking · Violations & activity"
        title="Parking Sessions"
        description="Registered vehicles and their parking sessions."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input w-64 pl-10"
            placeholder="Search plate, owner, zone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sessions"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-surface p-1">
          {(["ALL", "ACTIVE", "COMPLETED"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`min-h-[32px] rounded-md px-3 text-xs font-semibold transition-colors duration-200 ${
                filter === f ? "bg-[#EA580C]/15 text-orange" : "text-muted hover:text-white"
              }`}
              aria-pressed={filter === f}
            >
              {f === "ALL" ? "All" : f[0] + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <QueryBoundary
        status={sessions.status}
        error={sessions.error}
        isEmpty={!sessions.data || sessions.data.length === 0}
        emptyTitle="No parking sessions."
        loadingRows={5}
        onRetry={() => sessions.refetch()}
      >
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">No sessions match your search.</p>
        ) : (
          <DataTable columns={columns} rows={rows} />
        )}
      </QueryBoundary>
    </div>
  );
}
