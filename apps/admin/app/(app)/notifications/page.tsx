"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill, ReadBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications(),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Operational alerts for facility maintainers."
        actions={
          notifications.data && notifications.data.unreadCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
              {notifications.data.unreadCount} unread
            </span>
          ) : null
        }
      />

      <QueryBoundary
        status={notifications.status}
        error={notifications.error}
        isEmpty={notifications.data?.notifications.length === 0}
        emptyTitle="No notifications."
        emptyMessage="Operational notifications will appear here."
        loadingRows={4}
      >
        <ul className="space-y-3">
          {notifications.data?.notifications.map((n) => (
            <li key={n.id} className="card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={n.type === "ZONE_FULL" ? "red" : "amber"}>{n.type}</Pill>
                    <ReadBadge read={n.read} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.zone ? `${n.zone.name} (${n.zone.code}) · ` : ""}
                    {formatDate(n.createdAt)}
                  </p>
                </div>
                {!n.read ? (
                  <button
                    type="button"
                    onClick={() => markRead.mutate(n.id)}
                    disabled={markRead.isPending}
                    className="btn-secondary shrink-0"
                  >
                    Mark as read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </QueryBoundary>
    </div>
  );
}
