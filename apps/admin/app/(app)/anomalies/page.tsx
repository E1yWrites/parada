"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AnomalyTypeBadge, ResolvedBadge, Pill } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { AdminAnomaly } from "@/lib/api/types";

export default function AnomaliesPage() {
  const anomalies = useQuery({
    queryKey: ["anomalies"],
    queryFn: () => api.anomalies(),
    refetchInterval: 30_000,
  });

  const columns: Column<AdminAnomaly>[] = [
    {
      key: "type",
      header: "What",
      cell: (a) => (
        <div>
          <AnomalyTypeBadge type={a.anomalyType} />
          {a.description ? <p className="mt-1 max-w-xs text-[11px] text-muted">{a.description}</p> : null}
        </div>
      ),
    },
    {
      key: "where",
      header: "Where",
      cell: (a) => (
        <div>
          <p className="text-sm text-white">{a.zoneCode ? `Zone ${a.zoneCode}` : "—"}</p>
          {a.cameraIdentifier ? <p className="font-mono text-[11px] text-muted">{a.cameraIdentifier}</p> : null}
        </div>
      ),
    },
    {
      key: "plate",
      header: "Plate",
      cell: (a) =>
        a.detectedPlate ? (
          <span className="font-mono text-sm font-semibold text-white">{a.detectedPlate}</span>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
    },
    {
      key: "when",
      header: "When",
      cell: (a) => <span className="font-mono text-xs text-muted">{formatDateTime(a.createdAt)}</span>,
    },
    {
      key: "source",
      header: "Source",
      cell: (a) => (a.source ? <Pill tone="neutral">{a.source}</Pill> : <span className="text-muted">—</span>),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => <ResolvedBadge resolved={a.resolved} />,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Management · Exceptions"
        title="Anomalies"
        description="Operational exceptions that require review."
      />

      <QueryBoundary
        status={anomalies.status}
        error={anomalies.error}
        isEmpty={!anomalies.data || anomalies.data.length === 0}
        emptyTitle="No anomalies detected."
        emptyMessage="The parking facility is operating within normal parameters."
        loadingRows={5}
        onRetry={() => anomalies.refetch()}
      >
        <DataTable columns={columns} rows={anomalies.data ?? []} />
      </QueryBoundary>
    </div>
  );
}
