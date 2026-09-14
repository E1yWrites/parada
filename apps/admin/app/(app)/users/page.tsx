"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { AdminUser } from "@/lib/api/types";

export default function UsersPage() {
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users(),
    refetchInterval: 60_000,
  });

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft">
            <Users className="h-4 w-4 text-brand" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal">{u.name}</p>
            <p className="text-[11px] text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (u) =>
        u.role === "ADMIN" ? (
          <Pill tone="info">Administrator</Pill>
        ) : (
          <Pill tone="neutral">User</Pill>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => (u.status === "ACTIVE" ? <Pill tone="success">Active</Pill> : <Pill tone="danger">Inactive</Pill>),
    },
    {
      key: "vehicles",
      header: "Vehicles",
      cell: (u) => <span className="font-display text-sm font-black tabular-nums text-charcoal">{u._count.vehicles}</span>,
    },
    {
      key: "sessions",
      header: "Sessions",
      cell: (u) => <span className="font-display text-sm font-black tabular-nums text-charcoal">{u._count.sessions}</span>,
    },
    {
      key: "created",
      header: "Joined",
      cell: (u) => <span className="font-mono text-xs font-semibold text-muted">{formatDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title="Users" description="Registered driver and administrator accounts." />

      <QueryBoundary
        status={users.status}
        error={users.error}
        isEmpty={!users.data || users.data.length === 0}
        emptyTitle="No users registered."
        loadingRows={5}
        onRetry={() => users.refetch()}
      >
        <DataTable columns={columns} rows={users.data ?? []} rowKey={(u) => u.id} caption="Users" />
      </QueryBoundary>
    </div>
  );
}