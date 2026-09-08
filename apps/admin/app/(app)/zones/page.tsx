"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinned, ArrowRight, DoorOpen, DoorClosed, Plus, Power, Play, Save, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatPct } from "@/lib/format";
import type { AdminZoneCreateInput, AdminZoneDetail } from "@/lib/api/types";

function OccupancyBar({ pct }: { pct: number }) {
  const color =
    pct >= 100 ? "bg-brand" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="occupancy-bar">
      <div
        className={`h-full rounded-full ${color} transition-all duration-300`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function CreateZoneForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AdminZoneCreateInput>({
    name: "",
    code: "",
    description: "",
    capacity: 10,
    status: "ACTIVE",
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createZone(form),
    onSuccess: () => {
      setForm({ name: "", code: "", description: "", capacity: 10, status: "ACTIVE" });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      onCreated();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Unable to save this zone.");
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <Card className="mb-6">
      <div className="border-b border-line/50 px-5 py-4">
        <p className="label-tech mb-1">Parking · Facility layout</p>
        <h2 className="font-display text-lg font-black tracking-tight text-charcoal">New zone</h2>
      </div>
      <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={submit}>
        <div>
          <label className="label">Name</label>
          <input
            className="input mt-1.5"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Zone A"
            required
          />
        </div>
        <div>
          <label className="label">Code</label>
          <input
            className="input mt-1.5"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="A"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <input
            className="input mt-1.5"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="North parking area"
          />
        </div>
        <div>
          <label className="label">Capacity</label>
          <input
            type="number"
            min="1"
            className="input mt-1.5"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {create.isPending ? "Creating zone…" : "Create zone"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-brand sm:col-span-2">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function ZoneStatusToggle({ zone }: { zone: AdminZoneDetail }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: () =>
      api.updateZone(zone.id, { status: zone.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Unable to update this zone.");
    },
  });

  function handleToggle() {
    const deactivating = zone.status === "ACTIVE";
    if (deactivating) {
      const ok = window.confirm(
        `Deactivate zone ${zone.name}? This zone will stop being offered as an available destination and will stop accepting new reservations and assignments. Existing parking sessions, reservations, fees, and history are not deleted.`
      );
      if (!ok) return;
    }
    toggle.mutate();
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-brand">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </span>
      ) : null}
      <Button
        variant={zone.status === "ACTIVE" ? "secondary" : "success"}
        title={zone.status === "ACTIVE" ? "Deactivate zone" : "Activate zone"}
        onClick={handleToggle}
        disabled={toggle.isPending}
      >
        {zone.status === "ACTIVE" ? (
          <>
            <Power className="h-4 w-4" aria-hidden="true" />
            {toggle.isPending ? "Deactivating…" : "Deactivate"}
          </>
        ) : (
          <>
            <Play className="h-4 w-4" aria-hidden="true" />
            {toggle.isPending ? "Activating…" : "Activate"}
          </>
        )}
      </Button>
    </div>
  );
}

export default function ZonesPage() {
  const [creating, setCreating] = useState(false);
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Parking · Zone inventory"
        title="Zones"
        description="Configure the parking facility: zones define the authoritative capacity; physical spaces are inventory/layout only."
        actions={
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? "Close" : "New zone"}
          </Button>
        }
      />

      {creating ? <CreateZoneForm onCreated={() => setCreating(false)} /> : null}

      <QueryBoundary
        status={zones.status}
        error={zones.error}
        isEmpty={!zones.data || zones.data.length === 0}
        emptyTitle="No parking zones yet."
        emptyMessage="Use “New zone” to configure the first parking zone of this establishment."
        loadingRows={4}
        onRetry={() => zones.refetch()}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {zones.data?.map((z) => (
            <div key={z.id} className="card block p-5">
              <Link href={`/zones/${z.id}`} aria-label={`View zone ${z.name}`} className="block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-brand-soft">
                      <MapPinned className="h-5 w-5 text-brand" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="label-tech">ZONE {z.code}</p>
                      <p className="mt-0.5 font-display text-base font-black text-charcoal">{z.name}</p>
                    </div>
                  </div>
                  <AvailabilityBadge value={z.availability} />
                </div>

                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <p className="font-display text-3xl font-black leading-none text-charcoal">
                      {z.occupiedCount}
                      <span className="text-base font-bold text-muted"> / {z.capacity}</span>
                    </p>
                    <p className="text-xs font-bold text-muted">
                      {z.availableCount} available · {formatPct(z.occupancyPct)}
                    </p>
                  </div>
                  <div className="mt-2.5">
                    <OccupancyBar pct={z.occupancyPct} />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-line/50 pt-4">
                  <div className="flex items-center gap-4 text-xs font-semibold text-muted">
                    <span className="flex items-center gap-1.5">
                      <DoorClosed className="h-4 w-4 text-charcoal" aria-hidden="true" />
                      {z.entryCamera ? z.entryCamera.identifier : "No entry cam"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <DoorOpen className="h-4 w-4 text-charcoal" aria-hidden="true" />
                      {z.exitCamera ? z.exitCamera.identifier : "No exit cam"}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />
                </div>
              </Link>

              <div className="mt-4 flex items-center justify-between border-t border-line/50 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {z.physicalInventory.active} of {z.physicalInventory.total} physical spaces active
                </p>
                <ZoneStatusToggle zone={z} />
              </div>
            </div>
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}