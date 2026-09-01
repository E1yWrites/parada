"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Check } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { ReadBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import type { AdminNotification } from "@/lib/api/types";

type Filter = "ALL" | "UNREAD";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("ALL");

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

  const marksAll = useMutation({
    mutationFn: async () => {
      const ids = (notifications.data?.notifications ?? [])
        .filter((n) => !n.read)
        .map((n) => n.id);
      for (const id of ids) await api.markNotificationRead(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const items = (notifications.data?.notifications ?? []).filter((n) =>
    filter === "UNREAD" ? !n.read : true
  );

  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Management · Operational alerts"
        title="Notifications"
        description="Zone-full and low-availability alerts."
        actions={
          <Button
            variant="ghost"
            onClick={() => marksAll.mutate()}
            disabled={marksAll.isPending || unreadCount === 0}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-surface p-1">
          {(["ALL", "UNREAD"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`min-h-[32px] rounded-md px-3 text-xs font-semibold transition-colors duration-200 ${
                filter === f ? "bg-[#EA580C]/15 text-orange" : "text-muted hover:text-white"
              }`}
              aria-pressed={filter === f}
            >
              {f}
              {f === "UNREAD" && unreadCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-orange/20 px-1.5 py-0.5 font-mono text-[10px] text-orange">
                  {unreadCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <QueryBoundary
        status={notifications.status}
        error={notifications.error}
        isEmpty={!notifications.data || notifications.data.notifications.length === 0}
        emptyTitle="No notifications."
        loadingRows={4}
        onRetry={() => notifications.refetch()}
      >
        <Card>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted">No {filter === "UNREAD" ? "unread " : ""}notifications.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((n: AdminNotification) => (
                <li key={n.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        n.read ? "bg-white/[0.03] text-muted" : "bg-[#EA580C]/15 text-orange"
                      }`}
                      aria-hidden="true"
                    >
                      {n.type === "ZONE_FULL" ? (
                        <BellRing className="h-4 w-4" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm ${n.read ? "text-muted" : "font-medium text-white"}`}>
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {n.zone ? `Zone ${n.zone.code}` : "All zones"} · {n.type} · {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <ReadBadge read={n.read} />
                    {!n.read ? (
                      <Button
                        variant="ghost"
                        className="min-h-[32px] px-3 text-xs"
                        onClick={() => markRead.mutate(n.id)}
                        disabled={markRead.isPending}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
