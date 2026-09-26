"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, Plus, Power, Play, Save, AlertCircle, X } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { parseCoordinates } from "@/lib/coordinates";
import { PageHeader } from "@/components/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { AvailabilityBadge, PlateChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SavedNote, SectionHeader } from "@/components/ui/Card";
import { OccupancyBar } from "@/components/ui/OccupancyBar";
import type { AdminZoneCreateInput, AdminZoneDetail } from "@/lib/api/types";

function CreateZoneForm({ onCreated, onClose }: { onCreated: (name: string) => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AdminZoneCreateInput>({
    name: "",
    code: "",
    description: "",
    capacity: 10,
    status: "ACTIVE",
  });
  const nameRef = useRef<HTMLInputElement>(null);
  // The "New zone" trigger unmounts while the form is open, so focus would
  // otherwise fall to <body>; start keyboard users on the first field.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  const [navigationLat, setNavigationLat] = useState("");
  const [navigationLng, setNavigationLng] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const navigation = parseCoordinates(navigationLat, navigationLng);
      if ("error" in navigation) {
        return Promise.reject(new ApiError("BAD_REQUEST", navigation.error, 400));
      }
      return api.createZone({ ...form, ...navigation });
    },
    onSuccess: (created) => {
      setForm({ name: "", code: "", description: "", capacity: 10, status: "ACTIVE" });
      setNavigationLat("");
      setNavigationLng("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      onCreated(created?.name ?? form.name);
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
    <Card className="mb-6 animate-fade-in">
      <SectionHeader
        title="New zone"
        description="Capacity sets how many cars this zone accepts."
        actions={
          <Button variant="ghost" size="sm" onClick={onClose} disabled={create.isPending}>
            <X className="h-4 w-4" aria-hidden="true" />
            Close
          </Button>
        }
      />
      <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={submit}>
        <div>
          <label htmlFor="zone-name" className="label">
            Name
          </label>
          <input
            ref={nameRef}
            id="zone-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Zone A"
            required
          />
        </div>
        <div>
          <label htmlFor="zone-code" className="label">
            Code
          </label>
          <input
            id="zone-code"
            className="input font-mono uppercase"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="A"
            required
          />
          <p className="field-help">Short identifier drivers see on the gate and in the app.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="zone-description" className="label">
            Description
          </label>
          <input
            id="zone-description"
            className="input"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="North parking area"
          />
          <p className="field-help">Shown to drivers as wayfinding help on the zone screen.</p>
        </div>
        <div>
          <label htmlFor="zone-capacity" className="label">
            Capacity
          </label>
          <input
            id="zone-capacity"
            type="number"
            min="1"
            className="input"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            required
          />
        </div>
        <div>
          <label htmlFor="zone-lat" className="label">
            Navigation latitude
          </label>
          <input
            id="zone-lat"
            className="input font-mono"
            inputMode="decimal"
            value={navigationLat}
            onChange={(e) => setNavigationLat(e.target.value)}
            placeholder="13.76447"
          />
          <p className="field-help">Optional now; drivers&apos; Directions stay disabled until both are set.</p>
        </div>
        <div>
          <label htmlFor="zone-lng" className="label">
            Navigation longitude
          </label>
          <input
            id="zone-lng"
            className="input font-mono"
            inputMode="decimal"
            value={navigationLng}
            onChange={(e) => setNavigationLng(e.target.value)}
            placeholder="121.06462"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {create.isPending ? "Creating zone…" : "Create zone"}
          </Button>
          {error ? (
            <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-danger">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function ZoneStatusToggle({ zone, onDone }: { zone: AdminZoneDetail; onDone: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: () =>
      api.updateZone(zone.id, { status: zone.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    onSuccess: (updated) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      onDone(`${zone.name} ${updated?.status === "INACTIVE" || zone.status === "ACTIVE" ? "deactivated" : "activated"}.`);
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
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <span role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-danger">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </span>
      ) : null}
      <Button
        variant={zone.status === "ACTIVE" ? "danger" : "success"}
        size="sm"
        aria-label={zone.status === "ACTIVE" ? `Deactivate ${zone.name}` : `Activate ${zone.name}`}
        onClick={handleToggle}
        loading={toggle.isPending}
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
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const newZoneRef = useRef<HTMLButtonElement>(null);
  const wasCreating = useRef(false);
  // The "New zone" button unmounts while the form is open; hand focus back
  // to it when the form closes instead of dropping it on <body>.
  useEffect(() => {
    if (wasCreating.current && !creating) newZoneRef.current?.focus();
    wasCreating.current = creating;
  }, [creating]);
  const announce = (text: string) => setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, text }));
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Zones"
        description="Capacity sets how many cars each zone accepts. Physical spaces are layout only."
        actions={
          creating ? null : (
            <Button ref={newZoneRef} variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New zone
            </Button>
          )
        }
      />

      {notice ? (
        <p className="mb-4">
          <SavedNote key={notice.id}>{notice.text}</SavedNote>
        </p>
      ) : null}

      {creating ? (
        <CreateZoneForm
          onCreated={(name) => {
            setCreating(false);
            announce(`Zone ${name} created.`);
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}

      <QueryBoundary
        status={zones.status}
        error={zones.error}
        isEmpty={!zones.data || zones.data.length === 0}
        emptyTitle="No parking zones yet."
        emptyMessage="Use “New zone” to configure the first parking zone of this establishment."
        loadingRows={4}
        onRetry={() => zones.refetch()}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {zones.data?.map((z) => (
            <Card key={z.id} className="flex flex-col">
              {/* No aria-label: the link's own text (name, count, status, cameras) is its name. */}
              <Link
                href={`/zones/${z.id}`}
                className="card-hover block rounded-t-panel p-5 focus-visible:outline-none focus-visible:shadow-focus"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlateChip>{z.code}</PlateChip>
                    <p className="truncate font-display text-base font-black text-charcoal">{z.name}</p>
                  </div>
                  {z.availability !== "AVAILABLE" ? <AvailabilityBadge value={z.availability} /> : null}
                </div>

                {/* Occupancy once: the count, and the bar that draws it. */}
                <p className="mt-5 font-display text-3xl font-black leading-none tabular-nums text-charcoal">
                  <span>{z.occupiedCount}</span>
                  <span className="text-base font-bold text-muted"> / {z.capacity} occupied</span>
                </p>
                <div className="mt-3">
                  <OccupancyBar pct={z.occupancyPct} availability={z.availability} />
                </div>

                <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1.5">
                    <LogIn className="h-4 w-4 text-charcoal" aria-hidden="true" />
                    {z.entryCamera ? <span className="font-mono">{z.entryCamera.identifier}</span> : "No entry camera"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <LogOut className="h-4 w-4 text-charcoal" aria-hidden="true" />
                    {z.exitCamera ? <span className="font-mono">{z.exitCamera.identifier}</span> : "No exit camera"}
                  </span>
                </div>
              </Link>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                <p className="text-xs font-semibold text-muted">
                  {z.physicalInventory.active} of {z.physicalInventory.total} physical spaces active
                </p>
                <ZoneStatusToggle zone={z} onDone={announce} />
              </div>
            </Card>
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}
