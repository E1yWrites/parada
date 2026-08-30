"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export default function UsersPage() {
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users(),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader title="Users" description="Registered accounts. Read-only view." />

      <QueryBoundary
        status={users.status}
        error={users.error}
        isEmpty={users.data?.length === 0}
        emptyTitle="No users found."
        loadingRows={4}
      >
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Vehicles</th>
                <th>Sessions</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td>
                    <Pill tone={u.role === "ADMIN" ? "brand" : "slate"}>{u.role}</Pill>
                  </td>
                  <td>
                    <Pill tone={u.status === "ACTIVE" ? "green" : "amber"}>{u.status}</Pill>
                  </td>
                  <td className="text-slate-700">{u._count.vehicles}</td>
                  <td className="text-slate-700">{u._count.sessions}</td>
                  <td className="text-slate-600">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryBoundary>
    </div>
  );
}
