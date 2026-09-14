"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, DoorClosed, DoorOpen, Clock3, Save, Plus, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { Card, SavedNote, SectionHeader } from "@/components/ui/Card";
import { FacilityStrip, MetricCard } from "@/components/ui/MetricCard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, OnlineBadge, Pill, PlateChip, AVAILABILITY_BAR } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime, formatPct } from "@/lib/format";
import type { AdminZoneDetail, AdminSlot } from "@/lib/api/types";
import { parseCoordinates } from "@/lib/coordinates";

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
    // Kept as text so a half-typed "13." is not coerced; parsed on save.
    navigationLat: zone.navigationLat === null ? "" : String(zone.navigationLat),
    navigationLng: zone.navigationLng === null ? "" : String(zone.navigationLng),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const navigation = parseCoordinates(form.navigationLat, form.navigationLng);
      if ("error" in navigation) {
        return Promise.reject(new ApiError("BAD_REQUEST", navigation.error, 400));
      }
      return api.updateZone(zone.id, {
        name: form.name,
        code: form.code,
        description: form.description,
        capacity: form.capacity,
        status: form.status,
        ...navigation,
      });
    },
    onSuccess: (next) => {
      setForm({
        name: next.name,
        code: next.code,
        description: next.description ?? "",
        capacity: next.capacity,
        status: next.status,
        navigationLat: next.navigationLat === null ? "" : String(next.navigationLat),
        navigationLng: next.navigationLng === null ? "" : String(next.navigationLng),
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
      <SectionHeader title="Zone configuration" description="Name, code, capacity and status" />
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
          <label htmlFor="edit-zone-name" className="label">Name</label>
          <input
            id="edit-zone-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="edit-zone-code" className="label">Code</label>
          <input
            id="edit-zone-code"
            className="input font-mono uppercase"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit-zone-description" className="label">Description</label>
          <input
            id="edit-zone-description"
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="edit-zone-capacity" className="label">Capacity</label>
          <input
            id="edit-zone-capacity"
            type="number"
            min="1"
            className="input"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            required
          />
          <p className="field-help">Cannot drop below the current occupancy or reserved spaces.</p>
        </div>
        <div>
          <label htmlFor="edit-zone-lat" className="label">Navigation latitude</label>
          <input
            id="edit-zone-lat"
            className="input font-mono"
            inputMode="decimal"
            value={form.navigationLat}
            onChange={(e) => setForm({ ...form, navigationLat: e.target.value })}
            placeholder="13.76447"
          />
          <p className="field-help">WGS84, -90 to 90. Drivers&apos; Directions open the map at exactly this point.</p>
        </div>
        <div>
          <label htmlFor="edit-zone-lng" className="label">Navigation longitude</label>
          <input
            id="edit-zone-lng"
            className="input font-mono"
            inputMode="decimal"
            value={form.navigationLng}
            onChange={(e) => setForm({ ...form, navigationLng: e.target.value })}
            placeholder="121.06462"
          />
          <p className="field-help">-180 to 180. Leave both empty to disable Directions for this zone.</p>
        </div>
        <div>
          <label htmlFor="edit-zone-status" className="label">Status</label>
          <select
            id="edit-zone-status"
            className="input"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "INACTIVE" })}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {save.isPending ? "Saving zone…" : "Save zone"}
          </Button>
          {saved ? <SavedNote>Zone saved.</SavedNote> : null}
          {error ? (
            <span role="alert" className="flex items-center gap-2 text-sm font-semibold text-danger">
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
        title="Physical spaces"
        description="Layout inventory only — never drives occupancy, reservations or camera counting."
        actions={
          <Button variant="secondary" size="sm" onClick={() => resetToCapacity.mutate()} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {resetToCapacity.isPending ? "Syncing…" : "Reset to capacity"}
          </Button>
        }
      />
      <div className="p-5">
        <div className="flex items-center gap-2">
          <input
            className="input flex-1 font-mono"
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

        {saved ? <p className="mt-3"><SavedNote>Physical inventory updated.</SavedNote></p> : null}
        {error ? (
          <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-semibold text-danger">
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
                  className={`flex items-center justify-between gap-2 rounded-control border px-3 py-2 ${
                    slot.status === "ACTIVE" ? "border-line bg-white" : "border-transparent bg-raised opacity-70"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-charcoal">{slot.slotCode}</p>
                    <Pill tone={slot.status === "ACTIVE" ? "success" : "neutral"} className="mt-1 min-h-[22px] text-[10.5px]">
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:shadow-focus"
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
      <Link href="/zones" className="btn-ghost btn-sm mb-5 -ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to zones
      </Link>

      <QueryBoundary status={zones.status} error={zones.error} isEmpty={!zone} loadingRows={3}>
        {zone ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <PlateChip>{zone.code}</PlateChip>
                  <h1 className="font-display text-[1.75rem] font-black leading-tight tracking-tight text-charcoal">{zone.name}</h1>
                </div>
                {zone.description ? <p className="mt-1.5 text-sm text-muted">{zone.description}</p> : null}
                <p className="mt-1.5 font-mono text-xs font-semibold text-muted" data-testid="zone-navigation-summary">
                  {zone.navigationLat !== null && zone.navigationLng !== null
                    ? `Directions target: ${zone.navigationLat}, ${zone.navigationLng}`
                    : "Directions target: not configured (drivers see Directions disabled)"}
                </p>
              </div>
              <AvailabilityBadge value={zone.availability} />
            </div>

            <FacilityStrip label="Zone occupancy">
              <MetricCard label="Capacity" value={zone.capacity} detail="Authoritative total" />
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
              <MetricCard label="Occupancy" value={formatPct(zone.occupancyPct)} detail="Of capacity" accent="info" />
            </FacilityStrip>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <EditZoneForm zone={zone} />
              <PhysicalInventory zoneId={zone.id} zoneCode={zone.code} capacity={zone.capacity} />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Card>
                <SectionHeader title="Gate cameras" description="Entry and exit counting for this zone" />
                <div className="divide-y divide-line">
                  {[zone.entryCamera, zone.exitCamera].filter(Boolean).map((cam) => {
                    const isEntry = zone.entryCamera?.id === cam!.id;
                    const camStatus = zone.cameras.find((c) => c.id === cam!.id)?.status;
                    return (
                      <div key={cam!.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
                              isEntry ? "bg-success-soft text-success" : "bg-brand-soft text-brand"
                            }`}
                            aria-hidden="true"
                          >
                            {isEntry ? <DoorClosed className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-charcoal">{cam!.identifier}</p>
                            <p className="text-[11px] font-semibold text-muted">{isEntry ? "Entry" : "Exit"} gate</p>
                          </div>
                        </div>
                        <OnlineBadge online={camStatus === "ONLINE"} />
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

              <Card>
                <SectionHeader
                  title="Occupancy history"
                  description="Latest recorded counts"
                  actions={
                    <Link href={`/history?zone=${zone.id}`} className="btn-ghost btn-sm">
                      Full history <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                <QueryBoundary status={history.status} error={history.error} isEmpty={!history.data}>
                  {history.data && history.data.entries.length > 0 ? (
                    <div className="p-5">
                      <div className="flex h-24 items-end gap-0.5" aria-label="Occupancy trend">
                        {history.data.entries.slice(-40).map((e) => {
                          const cap = history.data!.zone.capacity;
                          const h = cap > 0 ? (e.occupiedCount / cap) * 100 : 0;
                          return (
                            <div
                              key={e.id}
                              title={`${formatDateTime(e.occurredAt)} · ${e.occupiedCount} / ${cap}`}
                              className={`flex-1 rounded-sm transition-colors duration-150 hover:bg-brand-dark ${AVAILABILITY_BAR[zone.availability]} opacity-80`}
                              style={{ height: `${Math.max(4, h)}%` }}
                            />
                          );
                        })}
                      </div>
                      <ul className="mt-4 divide-y divide-line border-t border-line">
                        {history.data.entries.slice(-6).map((e) => (
                          <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                            <span className="font-mono text-xs font-semibold text-muted">{formatDateTime(e.occurredAt)}</span>
                            <span className="font-display text-sm font-black tabular-nums text-charcoal">{e.occupiedCount}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-muted">No occupancy history recorded for this zone yet.</p>
                  )}
                </QueryBoundary>
              </Card>
            </div>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
