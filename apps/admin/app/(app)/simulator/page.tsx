"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

interface ScenarioDef {
  value: "SINGLE_ENTRY" | "SINGLE_EXIT" | "MULTIPLE_ENTRIES" | "MULTIPLE_EXITS" | "FILL_ZONE" | "UNKNOWN_VEHICLE" | "DUPLICATE_EVENT" | "COMPLETE_PARKING_LIFECYCLE";
  label: string;
  needsVehicle?: boolean;
  needsZone?: boolean;
}

const SCENARIOS: ScenarioDef[] = [
  { value: "SINGLE_ENTRY", label: "Single Entry", needsVehicle: true, needsZone: true },
  { value: "SINGLE_EXIT", label: "Single Exit", needsVehicle: true, needsZone: true },
  { value: "MULTIPLE_ENTRIES", label: "Multiple Entries", needsZone: true },
  { value: "MULTIPLE_EXITS", label: "Multiple Exits", needsZone: true },
  { value: "FILL_ZONE", label: "Fill Zone", needsZone: true },
  { value: "UNKNOWN_VEHICLE", label: "Unknown Vehicle", needsZone: true },
  { value: "DUPLICATE_EVENT", label: "Duplicate Event", needsVehicle: true, needsZone: true },
  { value: "COMPLETE_PARKING_LIFECYCLE", label: "Complete Lifecycle", needsVehicle: true, needsZone: true },
];

export default function SimulatorPage() {
  const queryClient = useQueryClient();

  const zones = useQuery({ queryKey: ["zones"], queryFn: () => api.zones() });
  const status = useQuery({ queryKey: ["simulator-status"], queryFn: () => api.simulatorStatus() });

  const [scenario, setScenario] = useState<ScenarioDef["value"]>("SINGLE_ENTRY");
  const [zoneId, setZoneId] = useState("");
  const [vehicleIds, setVehicleIds] = useState("");
  const [unknownPlate, setUnknownPlate] = useState("");
  const [fillTo, setFillTo] = useState("");

  const run = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { scenario };
      const current = SCENARIOS.find((s) => s.value === scenario);
      if (current?.needsZone && zoneId) payload.zoneId = zoneId;
      if (current?.needsVehicle && vehicleIds.trim()) {
        payload.vehicleIds = vehicleIds.split(",").map((v) => v.trim()).filter(Boolean);
      }
      if (scenario === "UNKNOWN_VEHICLE" && unknownPlate.trim()) payload.unknownPlate = unknownPlate.trim();
      if (scenario === "FILL_ZONE" && fillTo) payload.fillTo = Number(fillTo);
      return api.simulatorRun(payload);
    },
    onSuccess: (result) => {
      if (result.zone?.id) setZoneId(result.zone.id);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      queryClient.invalidateQueries({ queryKey: ["zone-occupancy"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["anomalies"] });
      queryClient.invalidateQueries({ queryKey: ["simulator-status"] });
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  const current = SCENARIOS.find((s) => s.value === scenario);

  return (
    <div>
      <PageHeader
        title="Simulator"
        description="Demo / testing tool that drives the real occupancy pipeline."
      />

      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>SIMULATION / DEMO.</strong> Running these scenarios creates simulated parking
        activity through the same pipeline used by real cameras. Simulated events are recorded with
        source <code>SIMULATOR</code> and are distinguishable from real camera events.
      </div>

      <QueryBoundary
        status={status.status}
        error={status.error}
        isEmpty={!status.data}
        emptyTitle="Simulator unavailable."
        loadingRows={2}
      >
        {status.data ? (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-sm text-slate-500">Runs</p>
              <p className="text-2xl font-bold text-slate-900">{status.data.runs}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">Events Processed</p>
              <p className="text-2xl font-bold text-slate-900">{status.data.eventsProcessed}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">Last Run</p>
              <p className="text-lg font-semibold text-slate-900">{formatDate(status.data.lastRunAt)}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">Scenarios</p>
              <p className="text-2xl font-bold text-slate-900">{status.data.scenarios.length}</p>
            </div>
          </div>
        ) : null}
      </QueryBoundary>

      <div className="card p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Run a scenario</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sim-scenario" className="label">
              Scenario
            </label>
            <select
              id="sim-scenario"
              className="input"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScenarioDef["value"])}
            >
              {SCENARIOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {current?.needsZone ? (
            <div>
              <label htmlFor="sim-zone" className="label">
                Zone
              </label>
              <select id="sim-zone" className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Default (first zone)</option>
                {zones.data?.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code} — {z.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {current?.needsVehicle ? (
            <div>
              <label htmlFor="sim-vehicles" className="label">
                Vehicle IDs (comma-separated)
              </label>
              <input
                id="sim-vehicles"
                className="input"
                value={vehicleIds}
                onChange={(e) => setVehicleIds(e.target.value)}
                placeholder="e.g. cuid1, cuid2"
              />
            </div>
          ) : null}
          {scenario === "UNKNOWN_VEHICLE" ? (
            <div>
              <label htmlFor="sim-plate" className="label">
                Unknown plate (optional)
              </label>
              <input
                id="sim-plate"
                className="input"
                value={unknownPlate}
                onChange={(e) => setUnknownPlate(e.target.value)}
                placeholder="e.g. ZZZ-9999"
              />
            </div>
          ) : null}
          {scenario === "FILL_ZONE" ? (
            <div>
              <label htmlFor="sim-fillto" className="label">
                Fill to (optional, default = capacity)
              </label>
              <input
                id="sim-fillto"
                type="number"
                min={0}
                className="input"
                value={fillTo}
                onChange={(e) => setFillTo(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="btn-primary mt-5"
        >
          {run.isPending ? "Running simulation…" : "Run simulation"}
        </button>

        {run.isError ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {run.error instanceof Error ? run.error.message : "Simulation failed."}
          </p>
        ) : null}

        {run.isSuccess ? (
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Result</h3>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase text-slate-400">Scenario</p>
                <p className="font-medium text-slate-800">{run.data.scenario}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Zone</p>
                <p className="font-medium text-slate-800">
                  {run.data.zone?.code ?? "—"} ({run.data.zone?.capacity ?? "?"} capacity)
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase text-slate-400">Events</p>
                <p className="font-medium text-slate-800">{run.data.events.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Rejects</p>
                <p className="font-medium text-slate-800">{run.data.rejects.length}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs uppercase text-slate-400">New occupancy</p>
              <p className="font-medium text-slate-800">
                {run.data.occupancy?.occupiedCount ?? "?"} occupied /{" "}
                {run.data.occupancy?.availableCount ?? "?"} available
              </p>
            </div>
            {run.data.rejects.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {run.data.rejects.map((r, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    {r.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
