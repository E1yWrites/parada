"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { DotPill, PlateChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdminViolation } from "@/lib/api/types";

const VIOLATION_TONE: Record<string, "success" | "warn" | "danger" | "neutral" | "info"> = {
  DISMISSED: "success",
  FINE_PAID: "success",
  PENDING: "warn",
  APPEALED: "info",
  UPHELD: "danger",
};

const VIOLATION_LABEL: Record<string, string> = {
  DISMISSED: "Dismissed",
  FINE_PAID: "Fine paid",
  PENDING: "Pending",
  APPEALED: "Under appeal",
  UPHELD: "Upheld",
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
      cell: (v) => <span className="font-mono text-sm font-bold text-charcoal">{v.vehicle?.plateNumber ?? "—"}</span>,
    },
    { key: "zone", header: "Zone", cell: (v) => <PlateChip>{v.zone.code}</PlateChip> },
    {
      key: "fine",
      header: "Fine",
      cell: (v) => <span className="font-display text-sm font-black tabular-nums text-warning">₱{v.fineAmount.toFixed(2)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-3">
          <DotPill tone={VIOLATION_TONE[v.status] ?? "neutral"}>{VIOLATION_LABEL[v.status] ?? v.status}</DotPill>
          {v.status === "PENDING" ? (
            <Button variant="secondary" size="sm" onClick={() => update.mutate({ id: v.id, status: "DISMISSED" })} disabled={update.isPending}>
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
        title="Violations"
        description="Establishment-defined parking violations and their resolution."
      />
      {update.error ? (
        <p role="alert" className="alert-danger mb-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
        <DataTable columns={columns} rows={query.data ?? []} rowKey={(v) => v.id} caption="Violations" />
      </QueryBoundary>
    </div>
  );
}