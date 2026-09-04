"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import type { AdminReservation } from "@/lib/api/types";

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const reservations = useQuery({ queryKey: ["reservations"], queryFn: () => api.reservations(), refetchInterval: 30_000 });
  const cancel = useMutation({ mutationFn: (id: string) => api.cancelReservation(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reservations"] }) });
  const columns: Column<AdminReservation>[] = [
    { key: "user", header: "User", cell: (r) => <div><p className="text-sm text-white">{r.user.name}</p><p className="text-[11px] text-muted">{r.user.email}</p></div> },
    { key: "vehicle", header: "Vehicle", cell: (r) => <span className="font-mono text-sm text-white">{r.vehicle.plateNumber}</span> },
    { key: "zone", header: "Zone", cell: (r) => <span className="text-sm text-muted">{r.zone.code}</span> },
    { key: "window", header: "Arrival window", cell: (r) => <div className="text-xs text-muted"><p>{formatDateTime(r.startAt)}</p><p>to {formatDateTime(r.endAt)}</p></div> },
    { key: "status", header: "Status", cell: (r) => <Pill tone={r.status === "CONFIRMED" || r.status === "ACTIVE" ? "info" : r.status === "CANCELLED" || r.status === "EXPIRED" ? "danger" : "neutral"}>{r.status}</Pill> },
    { key: "action", header: "Action", cell: (r) => r.status === "PENDING" || r.status === "CONFIRMED" ? <Button variant="ghost" className="min-h-[32px] px-3 text-xs" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}>Cancel</Button> : <span className="text-xs text-muted">—</span> },
  ];
  return <div><PageHeader eyebrow="Management · Capacity protection" title="Reservations" description="Monitor arrival windows, capacity protection, and reservation status." />{cancel.error ? <p role="alert" className="mb-4 text-sm text-rose-300">{cancel.error instanceof ApiError ? cancel.error.message : "Unable to cancel reservation."}</p> : null}<QueryBoundary status={reservations.status} error={reservations.error} isEmpty={!reservations.data || reservations.data.length === 0} emptyTitle="No reservations." loadingRows={5} onRetry={() => reservations.refetch()}><DataTable columns={columns} rows={reservations.data ?? []} /></QueryBoundary></div>;
}
