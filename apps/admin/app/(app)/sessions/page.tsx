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
          <p className="font-display text-base font-black tracking-tight text-charcoal">
            {s.vehicle?.plateNumber ?? "GUEST"}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-muted">{s.vehicle?.vehicleType ?? "ACCOUNT-LESS"}</p>
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
    { key: "zone", header: "Zone", cell: (s) => <span className="text-sm font-semibold text-charcoal">{s.zone.code}</span> },
    {
      key: "entry",
      header: "Entry",
      cell: (s) => (
        <span className="font-display text-sm font-bold text-charcoal">{new Date(s.enteredAt).toLocaleTimeString()}</span>
      ),
    },
    {
      key: "exit",
      header: "Exit",
      cell: (s) =>
        s.exitedAt ? (
          <span className="font-display text-sm font-bold text-charcoal">{new Date(s.exitedAt).toLocaleTimeString()}</span>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
    },
    {
      key: "duration",
      header: "Duration",
      cell: (s) => <span className="font-display text-sm font-bold text-charcoal">{formatDuration(s.durationSeconds)}</span>,
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
        eyebrow="Parking · Activity"
        title="Parking Sessions"
        description="Registered vehicles and their parking sessions."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input w-64 pl-11"
            placeholder="Search plate, owner, zone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sessions"
          />
        </div>
        <div className="flex items-center gap-1 rounded-panel border border-line/40 bg-white p-1">
          {(["ALL", "ACTIVE", "COMPLETED"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`min-h-[36px] rounded-panel px-4 text-xs font-bold uppercase tracking-wider transition-colors duration-200 ${
                filter === f ? "bg-brand-soft text-brand" : "text-muted hover:bg-graygreen/20 hover:text-charcoal"
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
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} />
        )}
      </QueryBoundary>
    </div>
  );
}