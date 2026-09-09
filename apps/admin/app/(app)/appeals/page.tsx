"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
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
          <p className="max-w-xs break-words text-xs text-muted">{a.reason}</p>
        </div>
      ),
    },
    {
      key: "violation",
      header: "Violation",
      cell: (a) => (
        <div>
          <p className="font-display text-sm font-black text-charcoal">{a.violation?.vehicle?.plateNumber ?? "—"}</p>
          <p className="text-xs text-muted">{a.violation?.zone.code ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={a.status === "PENDING" ? "warn" : a.status === "APPROVED" ? "success" : "danger"}>{a.status}</Pill>
          {a.status === "PENDING" ? (
            <>
              <Button variant="secondary" className="min-h-[36px] px-4 text-xs" onClick={() => review.mutate({ id: a.id, status: "APPROVED" })} disabled={review.isPending}>
                Approve
              </Button>
              <Button variant="ghost" className="min-h-[36px] px-4 text-xs" onClick={() => review.mutate({ id: a.id, status: "REJECTED" })} disabled={review.isPending}>
                Reject
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Management · Reviews"
        title="Appeals"
        description="Review user appeals against establishment-defined parking violations."
      />
      {review.error ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-panel border border-brand/25 bg-brand-soft px-3.5 py-2.5 text-sm font-semibold text-brand">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
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
        <DataTable columns={columns} rows={query.data ?? []} rowKey={(a) => a.id} />
      </QueryBoundary>
    </div>
  );
}