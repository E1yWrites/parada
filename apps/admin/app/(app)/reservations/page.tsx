"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { AdminReservation } from "@/lib/api/types";

const RESERVATION_TONE: Record<string, "info" | "danger" | "neutral" | "success"> = {
  CONFIRMED: "info",
  ACTIVE: "success",
  PENDING: "neutral",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  EXPIRED: "danger",
};

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const reservations = useQuery({ queryKey: ["reservations"], queryFn: () => api.reservations(), refetchInterval: 30_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelReservation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reservations"] }),
  });

  const columns: Column<AdminReservation>[] = [
    {
      key: "user",
      header: "User",
      cell: (r) => (
        <div>
          <p className="text-sm font-semibold text-charcoal">{r.user.name}</p>
          <p className="text-[11px] text-muted">{r.user.email}</p>
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (r) => <span className="font-display text-sm font-black text-charcoal">{r.vehicle.plateNumber}</span>,
    },
    { key: "zone", header: "Zone", cell: (r) => <span className="text-sm font-semibold text-charcoal">{r.zone.code}</span> },
    {
      key: "window",
      header: "Arrival window",
      cell: (r) => (
        <div className="text-xs text-muted">
          <p className="font-semibold text-charcoal">{formatDateTime(r.startAt)}</p>
          <p>to {formatDateTime(r.endAt)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Pill tone={RESERVATION_TONE[r.status] ?? "neutral"}>{r.status}</Pill>,
    },
    {
      key: "action",
      header: "Action",
      cell: (r) =>
        r.status === "PENDING" || r.status === "CONFIRMED" ? (
          <Button variant="secondary" className="min-h-[36px] px-4 text-xs" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}>
            Cancel
          </Button>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Management · Capacity protection"
        title="Reservations"
        description="Monitor arrival windows, capacity protection, and reservation status."
      />
      {cancel.error ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-panel border border-brand/25 bg-brand-soft px-3.5 py-2.5 text-sm font-semibold text-brand">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {cancel.error instanceof ApiError ? cancel.error.message : "Unable to cancel reservation."}
        </p>
      ) : null}
      <QueryBoundary
        status={reservations.status}
        error={reservations.error}
        isEmpty={!reservations.data || reservations.data.length === 0}
        emptyTitle="No reservations."
        loadingRows={5}
        onRetry={() => reservations.refetch()}
      >
        <DataTable columns={columns} rows={reservations.data ?? []} rowKey={(r) => r.id} />
      </QueryBoundary>
    </div>
  );
}