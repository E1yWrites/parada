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

      <div className="mb-5 flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-panel border border-line/40 bg-white p-1">
          {(["ALL", "UNREAD"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`min-h-[36px] rounded-panel px-4 text-xs font-bold uppercase tracking-wider transition-colors duration-200 ${
                filter === f ? "bg-brand-soft text-brand" : "text-muted hover:bg-graygreen/20 hover:text-charcoal"
              }`}
              aria-pressed={filter === f}
            >
              {f}
              {f === "UNREAD" && unreadCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-brand px-2 py-0.5 font-display text-[11px] font-black text-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {mutationError ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-panel border border-brand/25 bg-brand-soft px-3.5 py-2.5 text-sm font-semibold text-brand">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {mutationError instanceof Error ? mutationError.message : "Unable to update notifications."}
        </p>
      ) : null}

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
            <ul className="divide-y divide-line/30">
              {items.map((n: AdminNotification) => (
                <li key={n.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-panel ${
                        n.read ? "bg-graygreen/20 text-muted" : "bg-brand-soft text-brand"
                      }`}
                      aria-hidden="true"
                    >
                      {n.type === "ZONE_FULL" ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className={`break-words text-sm ${n.read ? "text-muted" : "font-bold text-charcoal"}`}>{n.message}</p>
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
                        className="min-h-[36px] px-4 text-xs"
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