"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { OnlineBadge, Pill } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { AdminCamera } from "@/lib/api/types";

const GATE_META: Record<string, { label: string; tone: "neutral" | "info" | "success" }> = {
  ENTRY: { label: "Entry", tone: "success" },
  EXIT: { label: "Exit", tone: "info" },
  BIDIRECTIONAL: { label: "Bidirectional", tone: "neutral" },
};

export default function CamerasPage() {
  const cameras = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api.cameras(),
    refetchInterval: 30_000,
  });

  const columns: Column<AdminCamera>[] = [
    {
      key: "camera",
      header: "Camera",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-panel bg-brand-soft">
            <Camera className="h-4 w-4 text-brand" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal">{c.identifier}</p>
            <p className="text-[11px] font-semibold text-muted">{c.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: "zone",
      header: "Zone",
      cell: (c) => <span className="text-sm font-semibold text-charcoal">{c.zone.code}</span>,
    },
    {
      key: "gate",
      header: "Gate",
      cell: (c) => {
        const meta = GATE_META[c.gateType] ?? GATE_META.BIDIRECTIONAL;
        return (
          <Pill tone={meta.tone} className="gap-1.5">
            {meta.label}
          </Pill>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <OnlineBadge online={c.status === "ONLINE"} />,
    },
    {
      key: "lastEvent",
      header: "Recent event",
      cell: (c) => {
        const last = c.recentEvents[0];
        return last ? (
          <div>
            <p className="text-xs font-bold text-charcoal">{last.detectedPlate ?? "Unknown"}</p>
            <p className="text-[11px] font-semibold text-muted">
              {last.eventType} · {formatDateTime(last.detectedAt)}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted">No events yet</span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Parking · Infrastructure"
        title="Cameras"
        description="Camera infrastructure status. Live video feeds arrive with real vision integration."
      />

      <QueryBoundary
        status={cameras.status}
        error={cameras.error}
        isEmpty={!cameras.data || cameras.data.length === 0}
        emptyTitle="No cameras configured."
        emptyMessage="Cameras will appear here once gate infrastructure is registered."
        loadingRows={4}
        onRetry={() => cameras.refetch()}
      >
        <DataTable columns={columns} rows={cameras.data ?? []} rowKey={(c) => c.id} />
      </QueryBoundary>
    </div>
  );
}