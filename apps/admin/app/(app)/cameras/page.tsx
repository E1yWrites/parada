"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { OnlineBadge, Pill } from "@/components/ui/Badge";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export default function CamerasPage() {
  const cameras = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api.cameras(),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Cameras"
        description="Camera registry and status. Video streaming is not part of this phase."
      />

      <QueryBoundary
        status={cameras.status}
        error={cameras.error}
        isEmpty={cameras.data?.length === 0}
        emptyTitle="No cameras found."
        emptyMessage="No cameras have been configured."
        loadingRows={4}
      >
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Identifier</th>
                <th>Name</th>
                <th>Zone</th>
                <th>Gate / Direction</th>
                <th>Status</th>
                <th>Recent Activity</th>
              </tr>
            </thead>
            <tbody>
              {cameras.data?.map((cam) => (
                <tr key={cam.id}>
                  <td className="font-mono text-xs text-slate-700">{cam.identifier}</td>
                  <td className="font-medium text-slate-800">{cam.name}</td>
                  <td className="text-slate-600">
                    {cam.zone.code} — {cam.zone.name}
                  </td>
                  <td className="text-slate-600">{cam.gateType}</td>
                  <td>
                    <OnlineBadge online={cam.status === "ONLINE"} />
                  </td>
                  <td>
                    {cam.recentEvents.length === 0 ? (
                      <span className="text-sm text-slate-400">No recent events</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {cam.recentEvents.slice(0, 3).map((ev) => (
                          <li key={ev.id} className="flex items-center gap-2 text-xs text-slate-500">
                            <Pill tone={ev.eventType === "ENTRY" ? "green" : "amber"}>
                              {ev.eventType}
                            </Pill>
                            <span>{formatDate(ev.detectedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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
