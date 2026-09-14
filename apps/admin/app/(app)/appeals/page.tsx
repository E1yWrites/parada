"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { DotPill, PlateChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdminAppeal } from "@/lib/api/types";

export default function AppealsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["appeals"], queryFn: () => api.appeals() });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => api.updateAppealStatus(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["appeals"] }),
  });

  const columns: Column<AdminAppeal>[] = [
    {
      key: "user",
      header: "User",
      cell: (a) => (
        <div>
          <p className="text-sm font-semibold text-charcoal">{a.user?.name ?? "Unknown user"}</p>
          <p className="max-w-xs whitespace-normal break-words text-xs text-muted">{a.reason}</p>
        </div>
      ),
    },
    {
      key: "violation",
      header: "Violation",
      cell: (a) => (
        <div>
          <p className="font-mono text-sm font-bold text-charcoal">{a.violation?.vehicle?.plateNumber ?? "—"}</p>
          <p className="mt-1">{a.violation?.zone.code ? <PlateChip soft>{a.violation.zone.code}</PlateChip> : <span className="text-xs text-muted">—</span>}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <div className="flex flex-wrap items-center gap-3">
          <DotPill tone={a.status === "PENDING" ? "warn" : a.status === "APPROVED" ? "success" : "danger"}>
            {a.status === "PENDING" ? "Pending" : a.status === "APPROVED" ? "Approved" : "Rejected"}
          </DotPill>
          {a.status === "PENDING" ? (
            <span className="flex items-center gap-2">
              <Button variant="success" size="sm" onClick={() => review.mutate({ id: a.id, status: "APPROVED" })} disabled={review.isPending}>
                Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => review.mutate({ id: a.id, status: "REJECTED" })} disabled={review.isPending}>
                Reject
              </Button>
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Appeals"
        description="Driver appeals against violations. Approving dismisses the fine; rejecting upholds it."
      />
      {review.error ? (
        <p role="alert" className="alert-danger mb-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {review.error instanceof ApiError ? review.error.message : "Unable to review appeal."}
        </p>
      ) : null}
      <QueryBoundary
        status={query.status}
        error={query.error}
        isEmpty={!query.data || query.data.length === 0}
        emptyTitle="No appeals."
        loadingRows={5}
        onRetry={() => query.refetch()}
      >
        <DataTable columns={columns} rows={query.data ?? []} rowKey={(a) => a.id} caption="Appeals" />
      </QueryBoundary>
    </div>
  );
}