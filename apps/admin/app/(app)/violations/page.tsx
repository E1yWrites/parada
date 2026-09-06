"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdminViolation } from "@/lib/api/types";

const VIOLATION_TONE: Record<string, "success" | "warn" | "danger" | "neutral"> = {
  DISMISSED: "success",
  FINE_PAID: "success",
  PENDING: "warn",
  APPEALED: "danger",
};

export default function ViolationsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["violations"], queryFn: () => api.violations() });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateViolationStatus(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["violations"] }),
  });

  const columns: Column<AdminViolation>[] = [
    {
      key: "type",
      header: "Type",
      cell: (v) => (
        <div>
          <p className="text-sm font-bold text-charcoal">{v.violationType}</p>
          <p className="text-xs text-muted">{v.description ?? "No description"}</p>
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (v) => <span className="font-display text-sm font-black text-charcoal">{v.vehicle?.plateNumber ?? "—"}</span>,
    },
    { key: "zone", header: "Zone", cell: (v) => <span className="text-sm font-semibold text-charcoal">{v.zone.code}</span> },
    {
      key: "fine",
      header: "Fine",
      cell: (v) => <span className="font-display text-sm font-black text-brand">₱{v.fineAmount.toFixed(2)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (v) => (
        <div className="flex items-center gap-2">
          <Pill tone={VIOLATION_TONE[v.status] ?? "neutral"}>{v.status}</Pill>
          {v.status === "PENDING" ? (
            <Button variant="secondary" className="min-h-[36px] px-4 text-xs" onClick={() => update.mutate({ id: v.id, status: "DISMISSED" })} disabled={update.isPending}>
              Dismiss
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Management · Establishment rules"
        title="Violations"
        description="Review establishment-defined parking violations and resolution status."
      />
      {update.error ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-panel border border-brand/25 bg-brand-soft px-3.5 py-2.5 text-sm font-semibold text-brand">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {update.error instanceof ApiError ? update.error.message : "Unable to update violation."}
        </p>
      ) : null}
      <QueryBoundary
        status={query.status}
        error={query.error}
        isEmpty={!query.data || query.data.length === 0}
        emptyTitle="No violations."
        loadingRows={5}
        onRetry={() => query.refetch()}
      >
        <DataTable columns={columns} rows={query.data ?? []} rowKey={(v) => v.id} />
      </QueryBoundary>
    </div>
  );
}