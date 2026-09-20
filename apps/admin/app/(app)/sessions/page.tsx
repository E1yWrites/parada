"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { PlateChip, SessionStatusBadge } from "@/components/ui/Badge";
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
      (s.vehicle?.plateNumber.toLowerCase().includes(q) ?? false) ||
      (s.user?.name.toLowerCase().includes(q) ?? false) ||
      s.zone.code.toLowerCase().includes(q)
    );
  });

  const columns: Column<AdminSession>[] = [
    {
      key: "plate",
      header: "License Plate",
      cell: (s) => (
        <div>
          <p className="font-mono text-sm font-bold text-charcoal">{s.vehicle?.plateNumber ?? "GUEST"}</p>
          <p className="text-[11px] font-semibold text-muted">{s.vehicle?.vehicleType ?? "ACCOUNT-LESS"}</p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (s) => (
        <div>
          <p className="text-sm font-semibold text-charcoal">{s.user?.name ?? "Guest session"}</p>
          <p className="text-[11px] text-muted">{s.user?.email ?? "No account attached"}</p>
        </div>
      ),
    },
    { key: "zone", header: "Zone", cell: (s) => <PlateChip>{s.zone.code}</PlateChip> },
    {
      key: "entry",
      header: "Entry",
      cell: (s) => (
        <span className="font-mono text-xs font-semibold text-charcoal">{new Date(s.enteredAt).toLocaleTimeString()}</span>
      ),
    },
    {
      key: "exit",
      header: "Exit",
      cell: (s) =>
        s.exitedAt ? (
          <span className="font-mono text-xs font-semibold text-charcoal">{new Date(s.exitedAt).toLocaleTimeString()}</span>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
    },
    {
      key: "duration",
      header: "Duration",
      cell: (s) => <span className="font-mono text-xs font-semibold text-charcoal">{formatDuration(s.durationSeconds)}</span>,
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
        title="Vehicles"
        description="Every camera-recorded entry and exit, for registered vehicles and guests."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input pl-11"
            placeholder="Search plate, owner, zone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sessions"
          />
        </div>
        <div className="segmented" role="group" aria-label="Filter sessions by status">
          {(["ALL", "ACTIVE", "COMPLETED"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="segmented-item"
              aria-pressed={filter === f}
            >
              {f === "ALL" ? "All" : f[0] + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold text-muted">{rows.length} shown</p>
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
          <p className="card p-6 text-sm text-muted">No sessions match your search.</p>
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} caption="Parking sessions" />
        )}
      </QueryBoundary>
    </div>
  );
}