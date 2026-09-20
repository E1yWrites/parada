"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bell, BellRing, Check } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
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

  const mutationError = markRead.error ?? marksAll.error;
  const items = (notifications.data?.notifications ?? []).filter((n) =>
    filter === "UNREAD" ? !n.read : true
  );
  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Zone-full and low-availability alerts raised by the occupancy engine."
        actions={
          <Button
            variant="secondary"
            onClick={() => marksAll.mutate()}
            disabled={marksAll.isPending || unreadCount === 0}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Mark all read
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-3">
        <div className="segmented" role="group" aria-label="Filter notifications">
          {(["ALL", "UNREAD"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="segmented-item uppercase tracking-[0.06em]"
              aria-pressed={filter === f}
            >
              {f}
              {f === "UNREAD" && unreadCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-brand px-2 py-0.5 font-display text-[11px] font-black text-on-accent">
                  {unreadCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {mutationError ? (
        <p role="alert" className="alert-danger mb-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {mutationError instanceof Error ? mutationError.message : "Unable to update notifications."}
        </p>
      ) : null}

      <QueryBoundary
        status={notifications.status}
        error={notifications.error}
        isEmpty={!notifications.data || notifications.data.notifications.length === 0}
        emptyTitle="No notifications."
        emptyMascot="notifications"
        loadingRows={4}
        onRetry={() => notifications.refetch()}
      >
        <Card>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted">No {filter === "UNREAD" ? "unread " : ""}notifications.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n: AdminNotification) => (
                <li key={n.id} className={`flex items-center justify-between gap-4 px-5 py-3.5 ${n.read ? "" : "bg-brand-soft/30"}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${
                        n.read ? "bg-raised text-muted" : n.type === "ZONE_FULL" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                      }`}
                      aria-hidden="true"
                    >
                      {n.type === "ZONE_FULL" ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className={`whitespace-normal break-words text-sm ${n.read ? "text-muted" : "font-bold text-charcoal"}`}>{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        <span className="font-semibold text-charcoal">{n.zone ? `Zone ${n.zone.code}` : "All zones"}</span>
                        {" · "}{n.type} · {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <ReadBadge read={n.read} />
                    {!n.read ? (
                      <Button
                        variant="secondary"
                        size="sm"
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