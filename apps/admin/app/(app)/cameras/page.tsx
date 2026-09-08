"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Save, Power, Play, Pencil, X, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { OnlineBadge, Pill } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import type { AdminCamera, AdminCameraEvent } from "@/lib/api/types";
import type { AdminZoneDetail } from "@/lib/api/types";

const GATE_META: Record<string, { label: string; tone: "neutral" | "info" | "success" }> = {
  ENTRY: { label: "Entry", tone: "success" },
  EXIT: { label: "Exit", tone: "info" },
  BIDIRECTIONAL: { label: "Bidirectional", tone: "neutral" },
};

interface FormState {
  zoneId: string;
  identifier: string;
  name: string;
  location: string;
  gateType: "ENTRY" | "EXIT" | "BIDIRECTIONAL";
  status: "ONLINE" | "OFFLINE";
}

const EMPTY: FormState = {
  zoneId: "",
  identifier: "",
  name: "",
  location: "",
  gateType: "BIDIRECTIONAL",
  status: "ONLINE",
};

function CameraForm({
  zones,
  editing,
  onDone,
}: {
  zones: AdminZoneDetail[];
  editing?: AdminCamera | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          zoneId: editing.zone.id,
          identifier: editing.identifier,
          name: editing.name,
          location: editing.location ?? "",
          gateType: editing.gateType,
          status: editing.status,
        }
      : EMPTY
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name || undefined,
        location: form.location || null,
        gateType: form.gateType,
        status: form.status,
      };
      if (editing) {
        return api.updateCamera(editing.id, { ...payload, zoneId: form.zoneId });
      }
      return api.createCamera({
        ...payload,
        zoneId: form.zoneId,
        identifier: form.identifier,
      });
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      onDone();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Unable to save this camera.");
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  const identifierDisabled = !!editing;

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between border-b border-line/50 px-5 py-4">
        <div>
          <p className="label-tech mb-1">Parking · Gate infrastructure</p>
          <h2 className="font-display text-lg font-black tracking-tight text-charcoal">
            {editing ? `Edit ${editing.identifier}` : "Register camera"}
          </h2>
        </div>
        <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
          <X className="h-4 w-4" aria-hidden="true" />
          Close
        </Button>
      </div>
      <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={submit}>
        <div className="sm:col-span-2">
          <label className="label">Camera identifier</label>
          <input
            className="input mt-1.5"
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            placeholder="CAM-A01"
            disabled={identifierDisabled}
            required
          />
          <p className="mt-1.5 text-xs text-muted">
            Stable, unique id fed to the vision pipeline. Cannot be changed after creation.
          </p>
        </div>
        <div>
          <label className="label">Associated zone</label>
          <select
            className="input mt-1.5"
            value={form.zoneId}
            onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
            required
          >
            <option value="">Select a zone…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} — {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Gate direction</label>
          <select
            className="input mt-1.5"
            value={form.gateType}
            onChange={(e) => setForm({ ...form, gateType: e.target.value as FormState["gateType"] })}
          >
            <option value="ENTRY">ENTRY</option>
            <option value="EXIT">EXIT</option>
            <option value="BIDIRECTIONAL">BIDIRECTIONAL</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select
            className="input mt-1.5"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
          >
            <option value="ONLINE">ONLINE (operational)</option>
            <option value="OFFLINE">OFFLINE (disabled)</option>
          </select>
        </div>
        <div>
          <label className="label">Display name</label>
          <input
            className="input mt-1.5"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Zone A Entry gate"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Location</label>
          <input
            className="input mt-1.5"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="North gate"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {save.isPending ? (editing ? "Saving camera…" : "Registering camera…") : editing ? "Save camera" : "Register camera"}
          </Button>
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

function ToggleStatus({ camera }: { camera: AdminCamera }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: () => api.updateCamera(camera.id, { status: camera.status === "ONLINE" ? "OFFLINE" : "ONLINE" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update this camera."),
  });

  const disabling = camera.status === "ONLINE";
  function handleToggle() {
    if (disabling) {
      const ok = window.confirm(
        `Disable ${camera.identifier}? The camera will stop accepting new parking events immediately. Its historical events, OCR results, and sessions are not deleted.`
      );
      if (!ok) return;
    }
    toggle.mutate();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={toggle.isPending}
        className={`inline-flex items-center gap-1.5 text-xs font-bold ${
          camera.status === "ONLINE" ? "text-muted hover:text-brand" : "text-emerald-600"
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}
      >
        {camera.status === "ONLINE" ? (
          <>
            <Power className="h-3.5 w-3.5" aria-hidden="true" />
            {toggle.isPending ? "Disabling…" : "Disable"}
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {toggle.isPending ? "Enabling…" : "Enable"}
          </>
        )}
      </button>
      {error ? (
        <span role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-brand">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default function CamerasPage() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminCamera | null>(null);

  const cameras = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api.cameras(),
    refetchInterval: 30_000,
  });
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.zones(),
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
  };
  const openEdit = (camera: AdminCamera) => {
    setCreating(true);
    setEditing(camera);
  };
  const close = () => {
    setCreating(false);
    setEditing(null);
  };

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
        const last = (c.recentEvents as AdminCameraEvent[] | undefined)?.[0];
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
    {
      key: "actions",
      header: "Actions",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openEdit(c)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
          <ToggleStatus camera={c} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Parking · Infrastructure"
        title="Cameras"
        description="Register and configure zone-gate cameras. Direction and operational status are backend-authoritative."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? "New camera" : "Register camera"}
          </Button>
        }
      />

      {creating ? (
        <CameraForm zones={zones.data ?? []} editing={editing} onDone={close} />
      ) : null}

      <QueryBoundary
        status={cameras.status}
        error={cameras.error}
        isEmpty={!cameras.data || cameras.data.length === 0}
        emptyTitle="No cameras configured."
        emptyMessage="Register the first zone-gate camera to begin configuration."
        loadingRows={4}
        onRetry={() => cameras.refetch()}
      >
        <DataTable columns={columns} rows={cameras.data ?? []} rowKey={(c) => c.id} />
      </QueryBoundary>
    </div>
  );
}