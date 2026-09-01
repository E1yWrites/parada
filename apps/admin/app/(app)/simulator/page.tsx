"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Activity, CheckCircle2, AlertCircle, Loader2, Ban, History } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Badge";
import type { SimulatorScenario } from "@/lib/api/types";

const INVALIDATE_KEYS: string[][] = [
  ["dashboard"],
  ["zones"],
  ["sessions"],
  ["notifications"],
  ["anomalies"],
  ["history"],
  ["simulator-status"],
];

const SCENARIO_OPTIONS: { value: SimulatorScenario; label: string; needsVehicles: boolean; isFill: boolean }[] = [
  { value: "SINGLE_ENTRY", label: "Single entry", needsVehicles: true, isFill: false },
  { value: "SINGLE_EXIT", label: "Single exit", needsVehicles: true, isFill: false },
  { value: "MULTIPLE_ENTRIES", label: "Multiple entries", needsVehicles: true, isFill: false },
  { value: "MULTIPLE_EXITS", label: "Multiple exits", needsVehicles: true, isFill: false },
  { value: "FILL_ZONE", label: "Fill zone", needsVehicles: false, isFill: true },
  { value: "UNKNOWN_VEHICLE", label: "Unknown vehicle (anomaly)", needsVehicles: false, isFill: false },
  { value: "DUPLICATE_EVENT", label: "Duplicate event", needsVehicles: true, isFill: false },
  { value: "COMPLETE_PARKING_LIFECYCLE", label: "Complete lifecycle", needsVehicles: true, isFill: false },
];

export default function SimulatorPage() {
  const queryClient = useQueryClient();
  const [scenario, setScenario] = useState<SimulatorScenario>("SINGLE_ENTRY");
  const [fillTo, setFillTo] = useState<number>(0);
  const [unknownPlate, setUnknownPlate] = useState<string>("");
  const [zoneId, setZoneId] = useState<string>("");

  const status = useQuery({
    queryKey: ["simulator-status"],
    queryFn: () => api.simulatorStatus(),
    refetchInterval: 10_000,
  });

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  const vehicles = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api.vehicles(),
    refetchInterval: 60_000,
  });

  const activeScenario = SCENARIO_OPTIONS.find((s) => s.value === scenario)!;

  const run = useMutation({
    mutationFn: () =>
      api.simulatorRun({
        scenario,
        zoneId: zoneId || undefined,
        vehicleIds:
          activeScenario.needsVehicles && vehicles.data?.length ? vehicles.data.map((v) => v.id) : undefined,
        fillTo: activeScenario.isFill && fillTo > 0 ? fillTo : undefined,
        unknownPlate: !activeScenario.needsVehicles && !activeScenario.isFill && unknownPlate ? unknownPlate : undefined,
      }),
    onSuccess: async () => {
      await Promise.all(
        INVALIDATE_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key }))
      );
    },
  });

  const result = run.data;

  return (
    <div>
      <PageHeader
        eyebrow="Tools · Load generation"
        title="Data Simulator"
        description="Exercise the parking pipeline with deterministic scenarios (ADMIN only)."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Controls */}
        <Card className="xl:col-span-1">
          <SectionHeader eyebrow="Configuration" title="Run a Scenario" />
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run.mutate();
            }}
          >
            <div>
              <label htmlFor="sim-scenario" className="label">
                Scenario
              </label>
              <select
                id="sim-scenario"
                className="input mt-1.5"
                value={scenario}
                onChange={(e) => setScenario(e.target.value as SimulatorScenario)}
              >
                {SCENARIO_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sim-zone" className="label">
                Zone
              </label>
              <select
                id="sim-zone"
                className="input mt-1.5"
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
              >
                <option value="">First zone (auto)</option>
                {zones.data?.map((z) => (
                  <option key={z.id} value={z.id}>
                    Zone {z.code} — {z.name}
                  </option>
                ))}
              </select>
            </div>

            {activeScenario.isFill ? (
              <div>
                <label htmlFor="sim-fill" className="label">
                  Fill to (spaces)
                </label>
                <input
                  id="sim-fill"
                  type="number"
                  min={0}
                  className="input mt-1.5"
                  placeholder="0 = fill to capacity"
                  value={fillTo || ""}
                  onChange={(e) => setFillTo(Number(e.target.value))}
                />
              </div>
            ) : null}

            {activeScenario.value === "UNKNOWN_VEHICLE" ? (
              <div>
                <label htmlFor="sim-unknown" className="label">
                  Unknown plate (optional)
                </label>
                <input
                  id="sim-unknown"
                  className="input mt-1.5 font-mono"
                  placeholder="Default ZZZ-UNKNOWN-1"
                  value={unknownPlate}
                  onChange={(e) => setUnknownPlate(e.target.value)}
                />
              </div>
            ) : null}

            {activeScenario.needsVehicles ? (
              <p className="text-[11px] text-muted">
                Will use {vehicles.data?.length ?? 0} registered active vehicles.
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={run.isPending}>
              {run.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {run.isPending ? "Running…" : "Run simulator"}
            </Button>

            {run.isError ? (
              <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {run.error instanceof Error
                    ? run.error.message
                    : "Simulator failed to run on the backend."}
                </span>
              </div>
            ) : null}
          </form>
        </Card>

        {/* Status + results */}
        <div className="space-y-6 xl:col-span-2">
          {/* Runtime status */}
          <QueryBoundary status={status.status} error={status.error} isEmpty={!status.data} onRetry={() => status.refetch()}>
            <Card>
              <SectionHeader eyebrow="Runtime" title="Simulator Status" />
              {status.data ? (
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
                  <StatusMetric label="Runs" value={String(status.data.runs)} />
                  <StatusMetric label="Events processed" value={String(status.data.eventsProcessed)} />
                  <StatusMetric
                    label="Last run"
                    value={status.data.lastRunAt ? new Date(status.data.lastRunAt).toLocaleString() : "Never"}
                  />
                </div>
              ) : (
                <p className="p-5 text-sm text-muted">No status available.</p>
              )}
            </Card>
          </QueryBoundary>

          {/* Last result */}
          <Card>
            <SectionHeader
              eyebrow="Output"
              title="Scenario Result"
              actions={
                <Pill tone="neutral">{result ? result.scenario : "—"}</Pill>
              }
            />
            <div className="p-5">
              {!result ? (
                <p className="text-sm text-muted">
                  Run a scenario to see its events and any rejections here.
                </p>
              ) : (
                <div className="space-y-4">
                  {result.zone ? (
                    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <History className="h-4 w-4 text-orange" aria-hidden="true" />
                        <div>
                          <p className="label-tech">ZONE {result.zone.code}</p>
                          <p className="text-sm text-white">{result.zone.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-white">
                          {result.occupancy?.occupiedCount}
                          <span className="text-muted"> / {result.zone.capacity}</span>
                        </p>
                        <p className="text-[11px] uppercase tracking-wider text-muted">Occupied</p>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-muted">
                      Events ({result.events.length})
                    </p>
                    {result.events.length === 0 ? (
                      <p className="text-sm text-muted">No events generated.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {result.events.map((e, i) => (
                          <li
                            key={`${i}`}
                            className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
                            <span className="font-mono text-[11px] text-muted">
                              {String(e.kind).replace(/_/g, " ")}
                            </span>
                            <span className="truncate font-mono text-xs text-white">
                              {String((e.event as { detectedPlate?: string })?.detectedPlate ?? "")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-muted">
                      Rejections ({result.rejects.length})
                    </p>
                    {result.rejects.length === 0 ? (
                      <p className="text-sm text-muted">No events were rejected.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {result.rejects.map((r) => (
                          <li
                            key={r.sourceEventId}
                            className="flex items-start gap-3 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2"
                          >
                            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
                            <div>
                              <p className="font-mono text-[11px] text-rose-200">{r.sourceEventId}</p>
                              <p className="text-xs text-rose-100/80">{r.message}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.03]" aria-hidden="true">
        <Activity className="h-4 w-4 text-orange" />
      </span>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
        <p className="font-mono text-xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
