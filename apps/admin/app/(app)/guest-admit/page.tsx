"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { FieldError, focusField, invalidProps } from "@/components/ui/FieldError";
import type { GuestAdmitResult } from "@/lib/api/types";

// The API needs an idempotency key per admission; the operator should never have to invent one.
// Not crypto.randomUUID(): it is secure-context only and the LOCAL profile may serve the admin over plain HTTP.
const newGuestEventId = () => `admin-guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function GuestAdmissionPage() {
  const [zoneId, setZoneId] = useState("");
  const [cameraIdentifier, setCameraIdentifier] = useState("");
  const [sourceEventId, setSourceEventId] = useState(newGuestEventId);
  const [detectedPlate, setDetectedPlate] = useState("");
  // Keyed by input id, so each message sits under (and describes) its field.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GuestAdmitResult | null>(null);

  const zones = useQuery({ queryKey: ["zones"], queryFn: () => api.zones() });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras() });
  const admit = useMutation({
    mutationFn: () => api.guestAdmit({
      zoneId,
      cameraIdentifier,
      sourceEventId,
      detectedPlate: detectedPlate.trim() || null,
    }),
    onSuccess: (next) => {
      // A retry after an error keeps the same id (idempotent); the next admission is a new event.
      setSourceEventId(newGuestEventId());
      setResult(next);
      setFieldErrors({});
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    const next: Record<string, string> = {};
    if (!zoneId) next["guest-zone"] = "Select a zone.";
    if (!cameraIdentifier) next["guest-camera"] = "Select an entry camera.";
    if (!detectedPlate.trim()) next["guest-plate"] = "Enter the guest plate detected by the camera.";
    setFieldErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      focusField(first);
      return;
    }
    admit.mutate();
  }

  const selectedCameras = cameras.data?.filter((camera) => !zoneId || camera.zone.id === zoneId) ?? [];

  return (
    <div>
      <PageHeader
        title="Guest Admission"
        description="Admit an unknown plate through the camera pipeline under an audited administrator override."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,28rem)_1fr]">
        <Card>
          <SectionHeader title="Admit a guest" description="Recorded with your administrator identity" />
          <form className="space-y-4 p-5" onSubmit={submit} noValidate>
            <div className="alert-warning">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>This action is recorded with the authenticated admin identity.</span>
            </div>
            <div>
              <label htmlFor="guest-zone" className="label">Zone</label>
              <select id="guest-zone" className="input" value={zoneId} onChange={(e) => { setZoneId(e.target.value); setCameraIdentifier(""); }} {...invalidProps("guest-zone", fieldErrors["guest-zone"])}>
                <option value="">Select a zone…</option>
                {zones.data?.map((zone) => <option key={zone.id} value={zone.id}>{zone.code} — {zone.name}</option>)}
              </select>
              <FieldError id="guest-zone" message={fieldErrors["guest-zone"]} />
            </div>
            <div>
              <label htmlFor="guest-camera" className="label">Entry camera</label>
              <select id="guest-camera" className="input" value={cameraIdentifier} onChange={(e) => setCameraIdentifier(e.target.value)} {...invalidProps("guest-camera", fieldErrors["guest-camera"])}>
                <option value="">Select a camera…</option>
                {selectedCameras.filter((camera) => camera.gateType === "ENTRY" || camera.gateType === "BIDIRECTIONAL").map((camera) => (
                  <option key={camera.id} value={camera.identifier}>{camera.identifier} — {camera.gateType}</option>
                ))}
              </select>
              <FieldError id="guest-camera" message={fieldErrors["guest-camera"]} />
            </div>
            <div>
              <label htmlFor="guest-plate" className="label">Detected plate</label>
              <input id="guest-plate" className="input font-mono uppercase" value={detectedPlate} onChange={(e) => setDetectedPlate(e.target.value)} placeholder="ABC-1234" {...invalidProps("guest-plate", fieldErrors["guest-plate"])} />
              <FieldError id="guest-plate" message={fieldErrors["guest-plate"]} />
            </div>
            {admit.error ? (
              <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {admit.error instanceof ApiError ? admit.error.message : "Guest admission failed."}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="w-full" disabled={admit.isPending}>
              {admit.isPending ? "Processing…" : "Admit guest"}
            </Button>
          </form>
        </Card>

        <QueryBoundary status={zones.status} error={zones.error} isEmpty={false} onRetry={() => zones.refetch()}>
          <Card className="min-h-[18rem]">
            <SectionHeader title="Admission result" description="The backend decision for the last submission" />
            <div className="p-5">
              {result ? (
                result.admitted ? (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex h-12 w-12 items-center justify-center rounded-control bg-success-soft" aria-hidden="true">
                      <CheckCircle2 className="h-6 w-6 text-success" />
                    </div>
                    <h2 className="font-display text-lg font-black tracking-tight text-charcoal">Guest admitted</h2>
                    <p className="text-sm text-muted">
                      Occupancy is now <span className="font-bold text-charcoal">{result.newOccupied}</span>. Guest session:{" "}
                      <span className="font-mono font-bold text-charcoal">{result.guestSessionId ?? "created"}</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex h-12 w-12 items-center justify-center rounded-control bg-warning-soft" aria-hidden="true">
                      <AlertCircle className="h-6 w-6 text-warning" />
                    </div>
                    <h2 className="font-display text-lg font-black tracking-tight text-charcoal">Guest not admitted</h2>
                    <p className="text-sm text-muted">{result.deniedReason ?? "The guest policy denied this entry."}</p>
                    <p className="text-xs text-muted">Occupancy remains {result.newOccupied}; no guest session was created.</p>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-3 text-sm text-muted">
                  <span className="flex h-9 w-9 items-center justify-center rounded-control bg-raised" aria-hidden="true">
                    <ShieldCheck className="h-4 w-4 text-muted" />
                  </span>
                  Submit a controlled admission to see the backend decision.
                </div>
              )}
            </div>
          </Card>
        </QueryBoundary>
      </div>
    </div>
  );
}