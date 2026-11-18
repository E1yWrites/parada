"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Button } from "@/components/ui/Button";
import { AnomalyTypeBadge, ResolvedBadge, Pill, PlateChip } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { AdminAnomaly } from "@/lib/api/types";

export default function AnomaliesPage() {
  const anomalies = useQuery({
    queryKey: ["anomalies"],
    queryFn: () => api.anomalies(),
    refetchInterval: 30_000,
  });

  const client = useQueryClient();
  const resolve = useMutation({
    mutationFn: (id: string) => api.resolveAnomaly(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["anomalies"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const columns: Column<AdminAnomaly>[] = [
    {
      key: "type",
      header: "What",
      cell: (a) => (
        <div>
          <AnomalyTypeBadge type={a.anomalyType} />
          {a.description ? <p className="mt-1 max-w-xs whitespace-normal break-words text-micro text-muted">{a.description}</p> : null}
        </div>
      ),
    },
    {
      key: "where",
      header: "Where",
      cell: (a) => (
        <div>
          <p className="text-sm font-semibold text-charcoal">{a.zoneCode ? <PlateChip>{a.zoneCode}</PlateChip> : "—"}</p>
          {a.cameraIdentifier ? <p className="mt-1 font-mono text-micro font-semibold text-muted">{a.cameraIdentifier}</p> : null}
        </div>
      ),
    },
    {
      key: "plate",
      header: "Plate",
      cell: (a) =>
        a.detectedPlate ? (
          <span className="font-mono text-sm font-bold text-charcoal">{a.detectedPlate}</span>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
    },
    {
      key: "when",
      header: "When",
      cell: (a) => <span className="font-mono text-xs font-semibold text-muted">{formatDateTime(a.createdAt)}</span>,
    },
    {
      key: "source",
      header: "Source",
      cell: (a) => (a.source ? <Pill tone="neutral">{a.source}</Pill> : <span className="text-muted">—</span>),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <div className="flex flex-wrap items-center gap-3">
          <ResolvedBadge resolved={a.resolved} />
          {a.resolved ? null : (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Resolve anomaly ${a.id}`}
              onClick={() => resolve.mutate(a.id)}
              disabled={resolve.isPending}
            >
              Resolve
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Anomalies" description="Exceptions the pipeline could not resolve on its own." />

      {resolve.error ? (
        <p role="alert" className="alert-danger mb-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {resolve.error instanceof ApiError ? resolve.error.message : "Unable to resolve anomaly."}
        </p>
      ) : null}
      <QueryBoundary
        status={anomalies.status}
        error={anomalies.error}
        isEmpty={!anomalies.data || anomalies.data.length === 0}
        emptyTitle="No anomalies detected."
        emptyMessage="The parking facility is operating within normal parameters."
        loadingRows={5}
        onRetry={() => anomalies.refetch()}
      >
        <DataTable columns={columns} rows={anomalies.data ?? []} rowKey={(a) => a.id} caption="Anomalies" />
      </QueryBoundary>
    </div>
  );
}