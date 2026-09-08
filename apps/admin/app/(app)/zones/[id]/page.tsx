"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPinned, DoorClosed, DoorOpen, Clock3, Save, Plus, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { Card, SectionHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, OnlineBadge, Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime, formatPct } from "@/lib/format";
import type { AdminZoneDetail, AdminSlot } from "@/lib/api/types";

function activeCodes(slots: AdminSlot[]): string[] {
  return slots.filter((s) => s.status === "ACTIVE").map((s) => s.slotCode);
}

function generateCodes(zoneCode: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${zoneCode}${String(i + 1).padStart(2, "0")}`);
}

function EditZoneForm({ zone }: { zone: AdminZoneDetail }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: zone.name,
    code: zone.code,
    description: zone.description ?? "",
    capacity: zone.capacity,
    status: zone.status,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.updateZone(zone.id, {
        name: form.name,
        code: form.code,
        description: form.description,
        capacity: form.capacity,
        status: form.status,
      }),
    onSuccess: (next) => {
      setForm({
        name: next.name,
        code: next.code,
        description: next.description ?? "",
        capacity: next.capacity,
        status: next.status,
      });
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      queryClient.invalidateQueries({ queryKey: ["history", zone.id] });
    },
    onError: (err) => {
      setSaved(false);
      setError(err instanceof ApiError ? err.message : "Unable to save this zone.");
    },
  });

  return (
    <Card>
      <SectionHeader eyebrow="Configuration" title="Edit zone" />
      <form
        className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          setError(null);
          save.mutate();
        }}
      >
        <div>
          <label className="label">Name</label>
          <input
            className="input mt-1.5"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Code</label>
          <input
            className="input mt-1.5"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <input
            className="input mt-1.5"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
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
          <p className="mt-1.5 text-xs text-muted">
            Capacity cannot drop below the current occupancy or reserved spaces.
          </p>
        </div>
        <div>
          <label className="label">Status</label>
          <select
            className="input mt-1.5"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "INACTIVE" })}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {save.isPending ? "Saving zone…" : "Save zone"}
          </Button>
          {saved ? <span className="text-sm font-semibold text-emerald-600">Zone saved.</span> : null}
          {error ? (
            <span role="alert" className="flex items-center gap-2 text-sm font-semibold text-brand">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function PhysicalInventory({ zoneId, zoneCode, capacity }: { zoneId: string; zoneCode: string; capacity: number }) {
  const queryClient = useQueryClient();
  const [newSlot, setNewSlot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const slots = useQuery({
    queryKey: ["zones", zoneId, "slots"],
    queryFn: () => api.zoneSlots(zoneId),
  });

  function apply(codes: string[], successMessage: string) {
    return api.setZoneSlots(zoneId, codes).then(() => {
      setSaved(true);
      setError(null);
      setNewSlot("");
      queryClient.invalidateQueries({ queryKey: ["zones", zoneId, "slots"] });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    });
  }

  const addSlot = useMutation({
    mutationFn: () =>
      apply([...activeCodes(slots.data ?? []), newSlot.trim()], "Space added."),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update physical inventory."),
  });

  const removeSlot = useMutation({
    mutationFn: (slotCode: string) =>
      apply(
        activeCodes(slots.data ?? []).filter((c) => c !== slotCode),
        "Space removed."
      ),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update physical inventory."),
  });

  const resetToCapacity = useMutation({
    mutationFn: () => apply(generateCodes(zoneCode, capacity), "Physical inventory set to capacity."),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update physical inventory."),
  });

  const busy = addSlot.isPending || removeSlot.isPending || resetToCapacity.isPending;

  return (
    <Card>
      <SectionHeader
        eyebrow="Layout · inventory only"
        title="Physical Spaces"
        actions={
          <Button variant="secondary" onClick={() => resetToCapacity.mutate()} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {resetToCapacity.isPending ? "Syncing…" : "Reset to capacity"}
          </Button>
        }
      />
      <div className="p-5">
        <p className="text-xs text-muted">
          Physical spaces are inventory/layout only. They never drive occupancy,
          reservations, assignments, or camera detection — zone capacity remains
          the authoritative availability metric.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <input
            className="input flex-1"
            value={newSlot}
            onChange={(e) => setNewSlot(e.target.value)}
            placeholder={`New space code (e.g. ${zoneCode}04)`}
            aria-label="New space code"
          />
          <Button
            onClick={() => {
              if (newSlot.trim().length === 0) return;
              setError(null);
              setSaved(false);
              addSlot.mutate();
            }}
            disabled={busy || newSlot.trim().length === 0}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add space
          </Button>
        </div>

        {saved ? <p className="mt-3 text-sm font-semibold text-emerald-600">Physical inventory updated.</p> : null}
        {error ? (
          <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div className="mt-4">
          <QueryBoundary
            status={slots.status}
            error={slots.error}
            isEmpty={!slots.data || slots.data.length === 0}
            emptyTitle="No physical spaces configured."
            emptyMessage="These are layout records only — they do not affect occupancy."
            loadingRows={3}
          >
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.data?.map((slot) => (
                <li
                  key={slot.id}
                  className={`flex items-center justify-between rounded-panel border px-3 py-2 ${
                    slot.status === "ACTIVE"
                      ? "border-line/60 bg-white"
                      : "border-line/40 bg-graygreen/20 opacity-60"
                  }`}
                >
                  <div>
                    <p className="font-display text-sm font-black text-charcoal">{slot.slotCode}</p>
                    <Pill tone={slot.status === "ACTIVE" ? "success" : "neutral"}>
                      {slot.status === "ACTIVE" ? "Active" : "Unavailable"}
                    </Pill>
                  </div>
                  {slot.status === "ACTIVE" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSaved(false);
                        removeSlot.mutate(slot.slotCode);
                      }}
                      disabled={busy}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      aria-label={`Remove ${slot.slotCode}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </QueryBoundary>
        </div>
      </div>
    </Card>
  );
}

export default function ZoneDetailPage() {
  const params = useParams<{ id: string }>();
  const zoneId = params.id;

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  const history = useQuery({
    queryKey: ["history", zoneId],
    queryFn: () => api.history(zoneId, { limit: 30 }),
    enabled: !!zoneId,
  });

  const zone = zones.data?.find((z) => z.id === zoneId);

  return (
    <div>
      <Link href="/zones" className="btn-ghost mb-5 -ml-1 text-xs">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to zones
      </Link>

      <QueryBoundary status={zones.status} error={zones.error} isEmpty={!zone} loadingRows={3}>
        {zone ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-brand-soft">
                  <MapPinned className="h-6 w-6 text-brand" aria-hidden="true" />
                </div>
                <div>
                  <p className="label-tech">ZONE {zone.code}</p>
                  <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">{zone.name}</h1>
                  {zone.description ? <p className="mt-0.5 text-sm text-muted">{zone.description}</p> : null}
                </div>
              </div>
              <AvailabilityBadge value={zone.availability} />
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Capacity" value={zone.capacity} detail="Total spaces" />
              <MetricCard
                label="Occupied"
                value={zone.occupiedCount}
                detail={formatPct(zone.occupancyPct)}
                accent={zone.availability === "FULL" ? "red" : zone.availability === "LOW_AVAILABILITY" ? "amber" : "none"}
              />
              <MetricCard
                label="Available"
                value={zone.availableCount}
                detail="Open spaces"
                accent={zone.availableCount === 0 ? "red" : "green"}
              />
              <MetricCard
                label="Occupancy"
                value={formatPct(zone.occupancyPct)}
                detail="Of capacity"
                accent="info"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {/* Cameras */}
              <Card>
                <SectionHeader eyebrow="Infrastructure" title="Gate Cameras" />
                <div className="divide-y divide-line/30">
                  {[zone.entryCamera, zone.exitCamera].filter(Boolean).map((cam) => {
                    const isEntry = zone.entryCamera?.id === cam!.id;
                    return (
                      <div key={cam!.id} className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-panel ${
                              isEntry ? "bg-emerald-50 text-emerald-600" : "bg-sky-50 text-sky-600"
                            }`}
                            aria-hidden="true"
                          >
                            {isEntry ? <DoorClosed className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}
                          </span>
                          <div>
                            <p className="font-display text-sm font-black text-charcoal">{cam!.identifier}</p>
                            <p className="text-[11px] uppercase tracking-wider text-muted">
                              {isEntry ? "Entry" : "Exit"} gate
                            </p>
                          </div>
                        </div>
                        {(() => {
                          const camStatus = zone.cameras.find((c) => c.id === cam!.id)?.status;
                          return <OnlineBadge online={camStatus === "ONLINE"} />;
                        })()}
                      </div>
                    );
                  })}
                  {!zone.entryCamera && !zone.exitCamera ? (
                    <p className="p-5 text-sm text-muted">
                      No cameras assigned to this zone. Register gate cameras from the Cameras page.
                    </p>
                  ) : null}
                </div>
              </Card>

              {/* Recent history snapshot */}
              <Card>
                <SectionHeader
                  eyebrow="Over time"
                  title="Occupancy History"
                  actions={
                    <Link href="/history" className="btn-ghost text-xs">
                      View history <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                <div className="p-5">
                  <QueryBoundary status={history.status} error={history.error} isEmpty={!history.data}>
                    {history.data && history.data.entries.length > 0 ? (
                      <ul className="space-y-1.5">
                        {history.data.entries.slice(-8).map((e) => (
                          <li
                            key={e.id}
                            className="flex items-center justify-between rounded-panel bg-graygreen/15 px-3.5 py-2 text-sm"
                          >
                            <span className="font-display text-xs font-bold text-muted">{formatDateTime(e.occurredAt)}</span>
                            <span className="font-display text-sm font-black text-charcoal">{e.occupiedCount}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">No occupancy history recorded for this zone yet.</p>
                    )}
                  </QueryBoundary>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <EditZoneForm zone={zone} />
              <PhysicalInventory
                zoneId={zone.id}
                zoneCode={zone.code}
                capacity={zone.capacity}
              />
            </div>

            {/* Occupancy timeline bar */}
            {history.data && history.data.entries.length > 0 ? (
              <Card>
                <SectionHeader eyebrow="Trend" title="Occupancy Over Time" />
                <div className="p-5">
                  <div className="flex h-24 items-end gap-0.5">
                    {history.data.entries.slice(-40).map((e) => {
                      const h = history.data!.zone.capacity > 0 ? (e.occupiedCount / history.data!.zone.capacity) * 100 : 0;
                      return (
                        <div
                          key={e.id}
                          title={`${e.occupiedCount} / ${history.data!.zone.capacity}`}
                          className="flex-1 rounded-sm bg-brand/70 transition-colors duration-200 hover:bg-brand"
                          style={{ height: `${Math.max(4, h)}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}