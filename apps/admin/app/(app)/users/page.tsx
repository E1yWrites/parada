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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Users className="h-4 w-4 text-orange" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{u.name}</p>
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
          <Pill tone="info" className="gap-1.5">
            Administrator
          </Pill>
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
      cell: (u) => <span className="font-mono text-sm text-white">{u._count.vehicles}</span>,
    },
    {
      key: "sessions",
      header: "Sessions",
      cell: (u) => <span className="font-mono text-sm text-white">{u._count.sessions}</span>,
    },
    {
      key: "created",
      header: "Joined",
      cell: (u) => <span className="font-mono text-xs text-muted">{formatDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Management · Accounts"
        title="Users"
        description="Registered accounts and their operational footprint."
      />

      <QueryBoundary
        status={users.status}
        error={users.error}
        isEmpty={!users.data || users.data.length === 0}
        emptyTitle="No users registered."
        loadingRows={5}
        onRetry={() => users.refetch()}
      >
        <DataTable columns={columns} rows={users.data ?? []} />
      </QueryBoundary>
    </div>
  );
}
