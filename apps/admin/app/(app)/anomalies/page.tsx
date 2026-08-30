"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Pill } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

const ANOMALY_LABEL: Record<string, string> = {
  UNREGISTERED_PLATE: "Unknown / unregistered plate",
  LOW_CONFIDENCE_PLATE: "Low-confidence plate detection",
  EXIT_WITHOUT_ACTIVE_SESSION: "Exit without an active session",
};

export default function AnomaliesPage() {
  const anomalies = useQuery({
    queryKey: ["anomalies"],
    queryFn: () => api.anomalies(),
    refetchInterval: 30_000,
  });

  const unresolved = (anomalies.data ?? []).filter((a) => !a.resolved).length;

  return (
    <div>
      <PageHeader
        title="Anomalies"
        description="Operational events that may require review."
        actions={
          unresolved > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
              {unresolved} unresolved
            </span>
          ) : null
        }
      />

      <QueryBoundary
        status={anomalies.status}
        error={anomalies.error}
        isEmpty={anomalies.data?.length === 0}
        emptyTitle="No anomalies detected."
        emptyMessage="Events that cannot be matched to a registered vehicle will appear here for review."
        loadingRows={4}
      >
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Type</th>
                <th>Plate</th>
                <th>Zone</th>
                <th>Detected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.data?.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Pill tone="red">{a.anomalyType}</Pill>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {ANOMALY_LABEL[a.anomalyType] ?? a.anomalyType}
                    </div>
                  </td>
                  <td>
                    {a.detectedPlate ? (
                      <span className="font-mono font-semibold text-slate-800">{a.detectedPlate}</span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                  <td className="text-slate-600">{a.zoneCode ? `Zone ${a.zoneCode}` : "—"}</td>
                  <td className="text-slate-600">{formatDate(a.createdAt)}</td>
                  <td>
                    <Pill tone={a.resolved ? "green" : "amber"}>
                      {a.resolved ? "RESOLVED" : "REVIEW REQUIRED"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryBoundary>
    </div>
  );
}
