"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Save } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import type { EstablishmentSettings } from "@/lib/api/types";

const EMPTY: EstablishmentSettings = {
  parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
  guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: null, maxDurationHours: 8, allowWhenFull: false },
  zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
  violations: [],
  location: null,
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["config"], queryFn: () => api.config() });
  const zones = useQuery({ queryKey: ["zones"], queryFn: () => api.zones() });
  const [form, setForm] = useState<EstablishmentSettings>(EMPTY);
  const [violationsText, setViolationsText] = useState("[]");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setForm(settings.data);
      setViolationsText(JSON.stringify(settings.data.violations, null, 2));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.updateConfig({ ...form, violations: JSON.parse(violationsText) }),
    onSuccess: (next) => {
      setForm(next);
      setSaved(true);
      queryClient.setQueryData(["config"], next);
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    try {
      const violations = JSON.parse(violationsText);
      if (!Array.isArray(violations)) throw new Error("Violation rules must be a JSON array.");
      setValidationError(null);
      save.mutate();
    } catch {
      setValidationError("Violation rules must be a valid JSON array.");
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Management · Runtime policy" title="Establishment Settings" description="Configure fees, guest admission, reservation windows, and violation rules." />
      <QueryBoundary status={settings.status} error={settings.error} isEmpty={false} onRetry={() => settings.refetch()}>
        <form className="grid grid-cols-1 gap-5 xl:grid-cols-2" onSubmit={submit}>
          <Card>
            <SectionHeader eyebrow="Parking fees" title="Rate policy" />
            <div className="space-y-4 p-5">
              <Field label="Base fee" value={form.parkingFee.baseFee} onChange={(value) => setForm({ ...form, parkingFee: { ...form.parkingFee, baseFee: value } })} />
              <Field label="Base duration (hours)" value={form.parkingFee.baseDurationHours} onChange={(value) => setForm({ ...form, parkingFee: { ...form.parkingFee, baseDurationHours: value } })} />
              <Field label="Additional fee per hour" value={form.parkingFee.additionalFeePerHour} onChange={(value) => setForm({ ...form, parkingFee: { ...form.parkingFee, additionalFeePerHour: value } })} />
            </div>
          </Card>
          <Card>
            <SectionHeader eyebrow="Guest policy" title="Admission rules" />
            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="guest-policy" className="label">Policy</label>
                <select id="guest-policy" className="input mt-1.5" value={form.guestPolicy.policy} onChange={(e) => setForm({ ...form, guestPolicy: { ...form.guestPolicy, policy: e.target.value as EstablishmentSettings["guestPolicy"]["policy"] } })}>
                  <option value="PRIMARY_ZONE">Primary zone</option>
                  <option value="DENY_WHEN_FULL">Deny when full</option>
                  <option value="ALLOW_OVERFLOW">Allow overflow policy</option>
                </select>
              </div>
              <div>
                <label htmlFor="guest-zone" className="label">Primary zone</label>
                <select id="guest-zone" className="input mt-1.5" value={form.guestPolicy.primaryZoneId ?? ""} onChange={(e) => setForm({ ...form, guestPolicy: { ...form.guestPolicy, primaryZoneId: e.target.value || null } })}>
                  <option value="">None configured</option>
                  {zones.data?.map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.code} — {zone.name}</option>
                  ))}
                </select>
              </div>
              <Field label="Maximum duration (hours)" value={form.guestPolicy.maxDurationHours} onChange={(value) => setForm({ ...form, guestPolicy: { ...form.guestPolicy, maxDurationHours: value } })} />
              <label className="flex items-center gap-2 text-sm font-semibold text-muted">
                <input type="checkbox" className="h-4 w-4 accent-brand" checked={form.guestPolicy.allowWhenFull} onChange={(e) => setForm({ ...form, guestPolicy: { ...form.guestPolicy, allowWhenFull: e.target.checked } })} />
                Allow policy when full (capacity invariant still applies)
              </label>
            </div>
          </Card>
          <Card>
            <SectionHeader eyebrow="Zone defaults" title="Operational thresholds" />
            <div className="space-y-4 p-5">
              <Field label="Reservation window (minutes)" value={form.zoneDefaults.maxReservationDurationMinutes} onChange={(value) => setForm({ ...form, zoneDefaults: { ...form.zoneDefaults, maxReservationDurationMinutes: value } })} />
              <Field label="Low-availability threshold (0–1)" value={form.zoneDefaults.occupancyLowThreshold} step="0.01" onChange={(value) => setForm({ ...form, zoneDefaults: { ...form.zoneDefaults, occupancyLowThreshold: value } })} />
            </div>
          </Card>
          <Card>
            <SectionHeader eyebrow="Violations" title="Configured rules" />
            <div className="space-y-3 p-5">
              <label htmlFor="violation-rules" className="label">Rules JSON</label>
              <textarea id="violation-rules" className="input min-h-32 font-display text-xs font-bold" value={violationsText} onChange={(event) => setViolationsText(event.target.value)} aria-describedby="violation-rules-help" />
              <p id="violation-rules-help" className="text-xs text-muted">Each rule requires type, fineAmount, and description. The backend validates the values.</p>
            </div>
          </Card>
          <div className="flex flex-wrap items-center gap-3 xl:col-span-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
            {saved ? <span className="text-sm font-semibold text-emerald-600">Settings saved.</span> : null}
            {validationError ? (
              <span role="alert" className="flex items-center gap-2 text-sm font-semibold text-brand">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {validationError}
              </span>
            ) : null}
            {save.error ? (
              <span role="alert" className="flex items-center gap-2 text-sm font-semibold text-brand">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {save.error instanceof ApiError ? save.error.message : "Unable to save settings."}
              </span>
            ) : null}
          </div>
        </form>
      </QueryBoundary>
    </div>
  );
}

function Field({ label, value, step = "1", onChange }: { label: string; value: number; step?: string; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" min="0" step={step} className="input mt-1.5" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}