"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { DotPill, PlateChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { AdminReservation } from "@/lib/api/types";

const RESERVATION_TONE: Record<string, "info" | "danger" | "neutral" | "success" | "warn"> = {
  CONFIRMED: "success",
  ACTIVE: "info",
  PENDING: "warn",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

const RESERVATION_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  ACTIVE: "Active",
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
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
      cell: (r) => <span className="font-mono text-sm font-bold text-charcoal">{r.vehicle.plateNumber}</span>,
    },
    { key: "zone", header: "Zone", cell: (r) => <PlateChip>{r.zone.code}</PlateChip> },
    {
      key: "window",
      header: "Arrival window",
      cell: (r) => (
        <div className="font-mono text-xs text-muted">
          <p className="font-semibold text-charcoal">{formatDateTime(r.startAt)}</p>
          <p>to {formatDateTime(r.endAt)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <DotPill tone={RESERVATION_TONE[r.status] ?? "neutral"} pulse={r.status === "ACTIVE"}>
          {RESERVATION_LABEL[r.status] ?? r.status}
        </DotPill>
      ),
    },
    {
      key: "action",
      header: "Action",
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) =>
        r.status === "PENDING" || r.status === "CONFIRMED" ? (
          <Button variant="danger" size="sm" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}>
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
        title="Reservations"
        description="Capacity holds with an arrival window. Cancelling releases the held space."
      />
      {cancel.error ? (
        <p role="alert" className="alert-danger mb-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
        <DataTable columns={columns} rows={reservations.data ?? []} rowKey={(r) => r.id} caption="Reservations" />
      </QueryBoundary>
    </div>
  );
}