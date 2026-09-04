"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdminViolation } from "@/lib/api/types";

export default function ViolationsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["violations"], queryFn: () => api.violations() });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.updateViolationStatus(id, status), onSuccess: () => client.invalidateQueries({ queryKey: ["violations"] }) });
  const columns: Column<AdminViolation>[] = [
    { key: "type", header: "Type", cell: (v) => <div><p className="text-sm font-semibold text-white">{v.violationType}</p><p className="text-xs text-muted">{v.description ?? "No description"}</p></div> },
    { key: "vehicle", header: "Vehicle", cell: (v) => <span className="font-mono text-sm text-white">{v.vehicle?.plateNumber ?? "—"}</span> },
    { key: "zone", header: "Zone", cell: (v) => <span className="text-sm text-muted">{v.zone.code}</span> },
    { key: "fine", header: "Fine", cell: (v) => <span className="font-mono text-sm text-white">₱{v.fineAmount.toFixed(2)}</span> },
    { key: "status", header: "Status", cell: (v) => <div className="flex items-center gap-2"><Pill tone={v.status === "DISMISSED" || v.status === "FINE_PAID" ? "success" : "warn"}>{v.status}</Pill>{v.status === "PENDING" ? <Button variant="ghost" className="min-h-[30px] px-2 text-xs" onClick={() => update.mutate({ id: v.id, status: "DISMISSED" })} disabled={update.isPending}>Dismiss</Button> : null}</div> },
  ];
  return <div><PageHeader eyebrow="Management · Establishment rules" title="Violations" description="Review establishment-defined parking violations and resolution status." />{update.error ? <p role="alert" className="mb-4 text-sm text-rose-300">{update.error instanceof ApiError ? update.error.message : "Unable to update violation."}</p> : null}<QueryBoundary status={query.status} error={query.error} isEmpty={!query.data || query.data.length === 0} emptyTitle="No violations." loadingRows={5} onRetry={() => query.refetch()}><DataTable columns={columns} rows={query.data ?? []} /></QueryBoundary></div>;
}
