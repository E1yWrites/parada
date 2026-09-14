"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Save } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SavedNote, SectionHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import type { EstablishmentSettings } from "@/lib/api/types";

const EMPTY: EstablishmentSettings = {
  parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
  guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: null },
  zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
  violations: [],
  location: null,
};

/** Text-field state for the navigation destination; blank address = none configured. */
type LocationForm = { address: string; latitude: string; longitude: string };

const NO_LOCATION: LocationForm = { address: "", latitude: "", longitude: "" };

function toLocationForm(location: EstablishmentSettings["location"]): LocationForm {
  return location
    ? { address: location.address, latitude: String(location.latitude), longitude: String(location.longitude) }
    : NO_LOCATION;
}

/**
 * Converts the text fields back into the API's `location` contract. A blank
 * address clears the destination (null); otherwise both coordinates must be
 * finite numbers in range — the backend validates again, this only gives the
 * operator an immediate message.
 */
function parseLocation(form: LocationForm): { location: EstablishmentSettings["location"] } | { error: string } {
  const address = form.address.trim();
  if (address.length === 0) {
    return { location: null };
  }
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  if (form.latitude.trim() === "" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: "Latitude must be a number between -90 and 90." };
  }
  if (form.longitude.trim() === "" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "Longitude must be a number between -180 and 180." };
  }
  return { location: { address, latitude, longitude } };
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["config"], queryFn: () => api.config() });
  const zones = useQuery({ queryKey: ["zones"], queryFn: () => api.zones() });
  const [form, setForm] = useState<EstablishmentSettings>(EMPTY);
  const [violationsText, setViolationsText] = useState("[]");
  const [locationForm, setLocationForm] = useState<LocationForm>(NO_LOCATION);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setForm(settings.data);
      setViolationsText(JSON.stringify(settings.data.violations, null, 2));
      setLocationForm(toLocationForm(settings.data.location));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (location: EstablishmentSettings["location"]) =>
      api.updateConfig({ ...form, location, violations: JSON.parse(violationsText) }),
    onSuccess: (next) => {
      setForm(next);
      setLocationForm(toLocationForm(next.location));
      setSaved(true);
      queryClient.setQueryData(["config"], next);
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    let violations: unknown;
    try {
      violations = JSON.parse(violationsText);
    } catch {
      setValidationError("Violation rules must be a valid JSON array.");
      return;
    }
    if (!Array.isArray(violations)) {
      setValidationError("Violation rules must be a valid JSON array.");
      return;
    }
    const location = parseLocation(locationForm);
    if ("error" in location) {
      setValidationError(location.error);
      return;
    }
    setValidationError(null);
    save.mutate(location.location);
  }

  return (
    <div>
      <PageHeader
        title="Establishment Settings"
        description="Fees, guest admission, reservation windows, navigation destination and violation rules. One save applies everything."
      />
      <QueryBoundary status={settings.status} error={settings.error} isEmpty={false} onRetry={() => settings.refetch()}>
        <form className="grid grid-cols-1 gap-5 xl:grid-cols-2" onSubmit={submit}>
          <Card>
            <SectionHeader title="Parking fees" description="Base fee covers the base duration; extra hours are charged on top" />
            <div className="space-y-4 p-5">
              <Field label="Base fee" value={form.parkingFee.baseFee} onChange={(value) => setForm({ ...form, parkingFee: { ...form.parkingFee, baseFee: value } })} />
              <Field label="Base duration (hours)" value={form.parkingFee.baseDurationHours} onChange={(value) => setForm({ ...form, parkingFee: { ...form.parkingFee, baseDurationHours: value } })} />
              <Field label="Additional fee per hour" value={form.parkingFee.additionalFeePerHour} onChange={(value) => setForm({ ...form, parkingFee: { ...form.parkingFee, additionalFeePerHour: value } })} />
            </div>
          </Card>
          <Card>
            <SectionHeader title="Guest admission" description="How unknown plates are handled at the gate" />
            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="guest-policy" className="label">Policy</label>
                <select id="guest-policy" className="input" value={form.guestPolicy.policy} onChange={(e) => setForm({ ...form, guestPolicy: { ...form.guestPolicy, policy: e.target.value as EstablishmentSettings["guestPolicy"]["policy"] } })}>
                  <option value="PRIMARY_ZONE">Primary zone</option>
                  <option value="DENY_WHEN_FULL">Deny when full</option>
                  <option value="ALLOW_OVERFLOW">Allow overflow policy</option>
                </select>
              </div>
              <div>
                <label htmlFor="guest-zone" className="label">Primary zone</label>
                <select id="guest-zone" className="input" value={form.guestPolicy.primaryZoneId ?? ""} onChange={(e) => setForm({ ...form, guestPolicy: { ...form.guestPolicy, primaryZoneId: e.target.value || null } })}>
                  <option value="">None configured</option>
                  {zones.data?.map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.code} — {zone.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
          <Card>
            <SectionHeader title="Zone defaults" description="Applied to every zone unless overridden" />
            <div className="space-y-4 p-5">
              <Field label="Reservation window (minutes)" value={form.zoneDefaults.maxReservationDurationMinutes} onChange={(value) => setForm({ ...form, zoneDefaults: { ...form.zoneDefaults, maxReservationDurationMinutes: value } })} />
              <Field label="Low-availability threshold (0–1)" value={form.zoneDefaults.occupancyLowThreshold} step="0.01" onChange={(value) => setForm({ ...form, zoneDefaults: { ...form.zoneDefaults, occupancyLowThreshold: value } })} />
            </div>
          </Card>
          <Card>
            <SectionHeader title="Navigation destination" description="Where the mobile app sends drivers" />
            <div className="space-y-4 p-5">
              <p className="text-xs text-muted">
                Leave the address blank to clear the destination — the app never invents one.
              </p>
              <div>
                <label htmlFor="location-address" className="label">Address</label>
                <input
                  id="location-address"
                  type="text"
                  className="input"
                  placeholder="e.g. LPU Batangas, Capitol Site"
                  value={locationForm.address}
                  onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="location-latitude" className="label">Latitude</label>
                  <input
                    id="location-latitude"
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    className="input font-mono"
                    value={locationForm.latitude}
                    onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="location-longitude" className="label">Longitude</label>
                  <input
                    id="location-longitude"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    className="input font-mono"
                    value={locationForm.longitude}
                    onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <SectionHeader title="Violation rules" description="Each rule needs a type, fineAmount and description" />
            <div className="space-y-3 p-5">
              <label htmlFor="violation-rules" className="label">Rules JSON</label>
              <textarea id="violation-rules" className="input font-mono text-xs" value={violationsText} onChange={(event) => setViolationsText(event.target.value)} aria-describedby="violation-rules-help" spellCheck={false} />
              <p id="violation-rules-help" className="field-help">JSON array. The backend validates every value before saving.</p>
            </div>
          </Card>
          <div className="card sticky bottom-4 z-20 flex flex-wrap items-center gap-3 px-5 py-3 shadow-card-hover xl:col-span-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
            {saved ? <SavedNote>Settings saved.</SavedNote> : null}
            {validationError ? (
              <span role="alert" className="flex items-center gap-2 text-sm font-semibold text-danger">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {validationError}
              </span>
            ) : null}
            {save.error ? (
              <span role="alert" className="flex items-center gap-2 text-sm font-semibold text-danger">
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
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type="number" min="0" step={step} className="input font-mono" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}