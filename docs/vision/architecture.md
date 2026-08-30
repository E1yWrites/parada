# PARADA — Vision / OCR Integration Architecture

Phase 5 establishes the **integration contract** between the camera/vision layer
and the backend. The backend is deliberately **agnostic to the specific
computer-vision/OCR implementation**; no real camera or ML model is required to
complete this phase.

## The Pipeline

```
CAMERA
  ↓  (raw frames)
VISION / OCR
  ↓  (produces a normalized event — see contract below)
NORMALIZED PARADING EVENT
  ↓  POST /zones/:id/events  (authenticated by X-API-Key)
BACKEND
  ↓
VEHICLE MATCHING
  ↓
OCCUPANCY + PARKING SESSION
  ↓
DATABASE
  ↓
MOBILE / ADMIN APPLICATIONS
```

## Distinct Concepts

These are different concerns and are modelled (and audited) separately:

| Concept | What it is | Where it lives / outcome |
|---------|-----------|--------------------------|
| **Vehicle detection** | A plate/vehicle is present in a frame (object detection). | Vision service (out of scope here). |
| **License plate recognition** | Reading the plate characters from the region (OCR / ANPR). | Vision service; outputs `detectedPlate` + `ocrConfidence`. |
| **Vehicle matching** | Mapping the detected plate onto registered vehicles via plate normalization. | Backend `OccupancyService.matchVehicle` (`services/api/src/domain/occupancy.ts`). |
| **Occupancy detection** | A physical entry/exit at a gate changed the zone count. | Backend `OccupancyService.processEvent`; updates `parking_zone.occupiedCount`. |
| **Parking session tracking** | A registered vehicle's presence from entry to exit. | Backend; creates/completes `parking_session`. |

Key rule: **occupancy and vehicle identity are independent.** A failure to
match a vehicle never blocks a valid physical occupancy update.

## Normalized Event Contract

The normalized shape produced by any vision service and consumed by the backend:

```json
{
  "sourceEventId": "camera-event-123",
  "cameraIdentifier": "cam-a-entry",
  "eventType": "ENTRY",
  "detectedPlate": "ABC-1234",
  "ocrConfidence": 0.96,
  "detectedAt": "2026-08-30T08:20:00Z"
}
```

Fields:

- `sourceEventId` (string, required) — client idempotency key, unique per camera.
  A duplicate `(cameraId, sourceEventId)` is rejected with 409 after being
  processed once.
- `cameraIdentifier` (string, required) — stable identifier of the camera.
- `eventType` (`"ENTRY" | "EXIT"`, required) — **gate direction**, taken from
  the camera configuration, not inferred from OCR.
- `detectedPlate` (string, optional) — raw plate from OCR; may be absent.
- `ocrConfidence` (number 0..1, optional) — OCR confidence.
- `detectedAt` (ISO timestamp, optional) — observed time; defaults to now.

The backend type is `NormalizedVisionEvent` (`services/api/src/domain/occupancy.ts`).

## Camera Model

A camera belongs to exactly one zone and has a gate direction:

```
ParkingZone
 ├── Entry Camera   (GateType = ENTRY)
 └── Exit Camera    (GateType = EXIT)
              (GateType = BIDIRECTIONAL for combined gates)
```

Validations applied on every event (`OccupancyService.validateCamera`):

1. Zone exists (404).
2. Camera exists (404).
3. Camera belongs to the requested zone (409).
4. Camera is `ONLINE` (409 if `OFFLINE`).
5. Direction is compatible: an `ENTRY` camera accepts only `ENTRY` events, an
   `EXIT` camera only `EXIT`; `BIDIRECTIONAL` accepts both (409 on mismatch).

Direction is driven by the camera configuration, not by OCR.

## Vehicle Matching

1. `detectedPlate` is normalized with `normalizePlate` (uppercase, alphanumeric
   only — e.g. `ABC-1234` -> `ABC1234`).
2. The normalized plate is searched against `ACTIVE` registered vehicles.
3. Exactly **one** vehicle match -> the event is linked to that vehicle (and,
   through it, its user). A session is created/completed.
4. Zero matches, or **more than one** vehicle owning the plate (ambiguous) ->
   no vehicle link (no session); the event is retained for audit.

## OCR Confidence Handling

- Confidence is stored on the event (`ocrConfidence`).
- `OCR_PLATE_CONFIDENCE_THRESHOLD` (default `0.5`, range 0..1) is the boundary.
- A plate whose confidence is **below** the threshold is **not treated as a
  reliable identity** — no vehicle match, no session — even if the plate is
  registered. Physical occupancy is still updated.
- An **absent** confidence signal is treated as trusted (the vision source is
  authenticated by API key and provides no confidence by policy).

## ENTRY Logic

1. validate camera → 2. validate zone → 3. validate direction → 4. normalize
plate → 5. vehicle match → 6. reject duplicate idempotency key (409) → 7. zone
not full (else 409) → 8. `occupiedCount += 1` → 9. create `OccupancyEvent` →
10. create `OccupancyHistory` → 11. if matched: create `ACTIVE` `ParkingSession`
→ 12. if not matched: record `UNREGISTERED_PLATE` (or `LOW_CONFIDENCE_PLATE`)
anomaly, **no fake vehicle/user/session** → 13. commit.

## EXIT Logic

1..6 same as ENTRY → 7. `occupiedCount > 0` (else 409) → 8. `occupiedCount -= 1`
→ 9. create `OccupancyEvent` → 10. create `OccupancyHistory` → 11. if matched:
find the vehicle's `ACTIVE` `ParkingSession` → 12. complete it → 13. record
`exitedAt` → 14. compute `durationSeconds` from entry/exit timestamps → 15. if no
ACTIVE session exists: record an `EXIT_WITHOUT_ACTIVE_SESSION` anomaly, **do not
fabricate a session** → 16. commit.

## Anomalies

`OccupancyAnomaly` records mismatches for admin review without fabricating data:

- `UNREGISTERED_PLATE` — a valid physical ENTRY with an unknown plate.
- `LOW_CONFIDENCE_PLATE` — a plate below the confidence threshold.
- `EXIT_WITHOUT_ACTIVE_SESSION` — an EXIT with no matching ACTIVE session.

Each anomaly is linked to its `OccupancyEvent`, camera, and (where applicable)
vehicle. Physical occupancy updates remain intact.

## Test Event Ingestion (Simulator)

Use the documented event endpoint with a valid camera identifier:

```bash
curl -X POST http://localhost:4000/zones/<zoneId>/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <CAMERA_API_KEY>" \
  -d '{
    "sourceEventId": "sim-001",
    "cameraIdentifier": "cam-a-entry",
    "eventType": "ENTRY",
    "detectedPlate": "ABC-1234",
    "ocrConfidence": 0.96
  }'
```

This is not a real camera; it drives the full backend pipeline before any real
vision model is connected.

## Security — Camera Event Ingestion

Production camera ingestion must not bypass authentication. The recommended,
simplest secure approach for the capstone is a **shared service API key**:

- The vision service presents `X-API-Key: <CAMERA_API_KEY>`.
- The key is configured via the `CAMERA_API_KEY` environment variable.
- If the key is **not set** (trusted local dev only), the endpoint stays open.
- In any real deployment a key must be set so the endpoint rejects calls
  without a valid key (401).

Other options considered: per-camera signed requests (HMAC) and mutual TLS.
These add infrastructure without capstone benefit; the shared key is adequate
for a protected, internal ingestion path.

## Recommended Vision/OCR Architecture

> Real computer vision is **out of scope for Phase 5**. This is the recommended
> direction, chosen to keep the stack small and Windows-friendly — not because
> a large stack is popular.

**Recommended (smallest practical, capstone-suitable):**
- **ANPR via a single library rather than a DIY detection+recognition pair.**
  The strongest fit is an **OpenALPR / ALPR-style annotation-agnostic engine**
  that outputs plate text + confidence. Among open-source options,
  **PaddleOCR (PP-OCRv4)** provides competitive accuracy with a real confidence
  score and a prebuilt Windows wheel.
- **Entry/exit detection**: derived from camera gate configuration (ENRY/EXIT),
  not from CV — the camera is assigned a direction. This removes the need for
  vehicle tracking/direction CV.

**Fallback / alternative:**
- **OpenCV + Tesseract** for a pure-OpenCV heuristic reader. Simpler to deploy
  but lower accuracy on dirty/angled plates and a weak confidence model.

## Alternatives Considered

| Stack | Pros | Cons |
|-------|------|------|
| PaddleOCR (PP-OCRv4) | High accuracy, real confidence, Windows wheel | ~500MB, heavier install |
| OpenCV + Tesseract | Tiny, pure CPU, easy Windows build | Lower accuracy, weak confidence |
| EasyOCR | Simple API, good default | Slower, less accurate than PP-OCR |
| YOLO (detect) + PaddleOCR (read) | Best accuracy for full scene | Two models, more complexity/latency |
| Commercial ANPR (OpenALPR/Vigilant) | Best accuracy off-the-shelf | Licensing cost, closed source |

## Data Flow / Backend Files

- `packages/database/prisma/schema.prisma` — `Camera`, `OccupancyEvent`,
  `OccupancyHistory`, `ParkingSession`, `OccupancyAnomaly` models.
- `services/api/src/domain/occupancy.ts` — `NormalizedVisionEvent`,
  `OccupancyService.processEvent` (matching, direction, confidence, anomaly).
- `services/api/src/routes/events.ts` — `POST /zones/:id/events` + X-API-Key gate.
- `services/api/src/config/env.ts` — `CAMERA_API_KEY`,
  `OCR_PLATE_CONFIDENCE_THRESHOLD`.
