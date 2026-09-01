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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Camera className="h-4 w-4 text-orange" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-white">{c.identifier}</p>
            <p className="text-[11px] text-muted">{c.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: "zone",
      header: "Zone",
      cell: (c) => <span className="text-sm text-white">{c.zone.code}</span>,
    },
    {
      key: "gate",
      header: "Gate",
      cell: (c) => {
        const meta = GATE_META[c.gateType] ?? GATE_META.BIDIRECTIONAL;
        return (
          <Pill tone={meta.tone}>
            {meta.label} · {c.gateType}
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
            <p className="font-mono text-xs text-white">{last.detectedPlate ?? "Unknown"}</p>
            <p className="text-[11px] text-muted">
              {last.eventType} · {formatDateTime(last.detectedAt)}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted">—</span>
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
        loadingRows={4}
        onRetry={() => cameras.refetch()}
      >
        <DataTable columns={columns} rows={cameras.data ?? []} />
      </QueryBoundary>
    </div>
  );
}
