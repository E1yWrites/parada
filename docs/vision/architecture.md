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

## Phase 11 — What Was Actually Built

Real inference now exists in `services/vision`, superseding the "out of
scope" note above. It deviates from this doc's earlier recommendation in one
way: **EasyOCR instead of PaddleOCR/Tesseract**, for reasons specific to the
development sandbox this was built in rather than a change in overall
direction:

- No `sudo`/apt access was available, so the `tesseract` system binary
  (required by `pytesseract`) could not be installed.
- PaddleOCR's dependency chain is heavier and more fragile to install than a
  single pip-installable, self-contained package under the ~1-2GB of free
  RAM this sandbox had at build time.
- **EasyOCR** (CRAFT detector + CRNN recognizer, Apache-2.0, pip-only, no
  system binary) met the "smallest mature, locally executable" bar and
  provides genuine per-result recognition confidence.

Plate **detection** (finding the plate-shaped region before OCR runs) is
classical OpenCV — blackhat morphology + Sobel gradient + Otsu threshold +
aspect-ratio-filtered contours — not a second neural network. This keeps the
detection stage dependency-free and fast, and keeps "detection confidence"
(a shape-based heuristic) clearly distinct from "OCR confidence" (the real
value EasyOCR's recognition network reports).

See `services/vision/README.md` for setup, the `/detect` API contract,
model/version/license details, measured latency, and known limitations.

## Phase 11A — Administrative Configuration (Resource & Camera Setup)

Phase 11A lets an administrator configure the physical facility entirely from
the Admin app — zones, capacity, physical-slot inventory, and zone-gate
cameras — **without code changes or re-deployment**. The domain rules below are
enforced by the backend (`ZoneConfigService` in
`services/api/src/domain/zoneConfig.ts`) and are authoritative; the Admin UI is
a thin client over them.

### Distinction: capacity vs. physical inventory

- **Zone capacity (`ParkingZone.capacity`) is the authoritative constraint** on
  occupancy. It is what `OccupancyService` enforces when accepting events.
- **Physical slots (`ParkingSlot`) are inventory/layout data only.** A zone has
  a physical layout of N spaces; these are **never** occupancy, reservation,
  camera, OCR, or navigation targets. Removing a physical space does not change
  occupancy; it only reduces the configured layout.
- A zone may have more or fewer physical spaces than allowed by editing
  capacity; the boundaries are:
  - active physical spaces **must not exceed** the zone capacity;
  - capacity **must not be reduced below** current occupancy;
  - capacity **must not be reduced below or equal to** `occupiedCount +
    protectingCount` (active reservations protecting the zone).

### Zone lifecycle

- `POST /admin/zones`, `PATCH /admin/zones/:id`, `GET/POST /admin/zones/:id/slots`.
- `status = ACTIVE | INACTIVE`. Deactivating a zone stops it being offered as an
  available destination and stops new reservations/assignments, but **does not
  delete** existing sessions, reservations, fees, or history.
- Zone `code` is unique; a duplicate is a 409.

### Camera lifecycle

- `POST /admin/cameras`, `PATCH /admin/cameras/:id`.
- A camera belongs to exactly one zone (`zoneId`) and has an immutable
  `identifier` (the stable value the vision pipeline sends as
  `cameraIdentifier`), a `gateType` (`ENTRY | EXIT | BIDIRECTIONAL`), and a
  `status` (`ONLINE | OFFLINE`).
- **`ONLINE` = operational, `OFFLINE` = disabled.** Disabling a camera makes
  `OccupancyService.validateCamera` reject its events with 409 and stops new
  events immediately; historical events, OCR results, sessions, and anomalies
  are never deleted or rewritten. There is no hard "delete camera" — `OFFLINE`
  is the intended disable path.
- The direction validation rules (ENTRY/EXIT/BIDIRECTIONAL) documented above run
  unchanged; configuration changes (zone re-assignment, direction, status) take
  effect on the next event while leaving history intact.

### Where configuration is expressed

- `packages/types` — shared input DTOs (`AdminZoneCreateInput`,
  `AdminZoneUpdateInput`, `AdminZoneSlotsInput`, `AdminCameraInput`,
  `AdminCameraUpdateInput`).
- `services/api/src/routes/admin.ts` — ADMIN-only mutation endpoints.
- `services/api/src/domain/zoneConfig.ts` — validation + persistence logic.
- `apps/admin` — Zones and Cameras pages plus the physical-space editor under
  each zone's detail page.

### Non-goals (explicitly out of Phase 11A)

- Slot-level occupancy, reservation, camera binding, OCR, or turn-by-turn
  navigation targeting. Physical slots remain inventory only.
- Auditing of who changed a configuration (not modelled).
- Per-slot or per-camera permissions; configuration is ADMIN-only in aggregate.

## Phase 11C — Physical Camera Provisioning & Vision Connectivity

Phase 11C connects the Phase 11A **logical camera configuration** to an
**actual frame source**. It lives entirely in `services/vision` (Python) —
there is **no** database schema change, no new API route, and no Admin/Mobile
code change. The camera's physical-source representation was deliberately
**not** added to the `Camera` model: database/Admin configuration stays purely
logical (identifier, zone, direction, status), and the physical binding is
server-side runtime configuration, so camera credentials never enter the
database or any API DTO (see "Security" below).

### Logical vs. physical separation

| Layer | `CAM-A01` is... | Stored where |
|---|---|---|
| Logical configuration | `identifier=CAM-A01`, `zoneId=Zone A`, `gateType=BIDIRECTIONAL`, `status=ONLINE` | Database (`Camera`), managed via Admin; authoritative |
| Physical source | a USB device index, or an RTSP URL, or a video-file path | Vision runtime env/config only |

The join key is the **camera identifier** (`CAMERA_IDENTIFIER` in the Vision
runtime). At event time the runtime sends `cameraIdentifier=CAM-A01` to the
existing API, which resolves camera→zone→direction→status itself — Vision never
duplicates the camera-zone mapping.

### CameraSource abstraction

```
USB ─────────┐
RTSP ────────┼──► CameraSource ─► Frame ─► process_image (existing pipeline)
VIDEO FILE ──┘        │                                   │
               open/read/close/isOpened            real OCR/detection
                                                         │
                                                  Normalized event
                                                         │
                                                  existing API POST /zones/:id/events
```

Every source implements the same minimal contract (`base.py`): `open()`,
`read_frame()`, `close()`, `resolution()`, `describe()`. Concrete sources:
`UsbCameraSource` (OpenCV `VideoCapture(device_index)`), `RtspCameraSource`
(`VideoCapture(rtsp://...)` with `rtsp://`-only validation and credential
redaction), `FileCameraSource` (deterministic Mp4 fixture, stops cleanly at
EOF). There is exactly **one** vision pipeline (`app/pipeline/service.py`) for
all three — no per-source OCR/business code.

### Runtime (`CameraRuntime`)

- Opens the source, reads frames at a capped `VISION_PROCESS_FPS` (default 2;
  a 30–60 FPS webcam is never OCR'd at device rate).
- Duplicate suppression (configurable `OBSERVATION_COOLDOWN_SECONDS`, default
  5s): the same camera + same normalized plate + same direction within the
  window is one observation, not N parking events. The API's
  `(cameraId, sourceEventId)` unique constraint **remains the final authority**
  — the runtime's deterministic `sourceEventId` (SHA-256 of the encoded frame)
  makes retries idempotent, and a duplicate `409` is logged and never re-sent.
- Failure isolation: a dead frame retries with backoff (`CAMERA_RECONNECT_DELAY`
  + `MAX_CAMERA_RECONNECTS`); a source that cannot open after the bound logs an
  error and stops that camera without crashing the service.
- `429` from the API is a throttle: bounded backoff, **not** treated as an auth
  failure (no credential rotation, no new token). `409` is a business answer
  (duplicate/full/offline/direction) and is not retried. `5xx`/transport is
  also bounded.
- Clean shutdown: `close()` stops the loop within ~100ms and releases OpenCV
  captures (no zombie handles).

### Choice of source is trusted server-side config only

No inbound API endpoint accepts "connect to this arbitrary URL" — there is **no
SSRF surface**. The source is chosen by environment variables
(`CAMERA_SOURCE`, `CAMERA_DEVICE_INDEX`, `CAMERA_FILE_PATH`, `VIDEO_SOURCE`)
read by the runtime CLI. RTSP is restricted to `rtsp://`/`rtsps://` and its
URL (including any embedded `user:password`) is redacted from every
log/response/`describe()`; only the scheme/host/port are ever surfaced.

### Development CLI

`npm run camera -w @parada/vision` (`python -m app.camera.cli`):

- `test` — open the configured source, report connection state, resolution,
  frame availability, and whether a plate is readable (no credentials).
- `run [--zone-id]` — the full frame→OCR→API loop; stops on Ctrl-C/SIGTERM or
  video EOF.

### Security

- Camera credentials (RTSP user/password, X-API-Key) live only in the Vision
  runtime environment; never in the database, never in any HTTP response, and
  never in logs. `describe()`/`status_text()` redact URL userinfo.
- Vision authenticates to the API only via the existing shared
  `CAMERA_API_KEY` (`X-API-Key` header). It never holds user or admin JWTs.
- No frames are persisted or uploaded anywhere; processing is fully in-memory.
  The codebase has no secret-store system, which is documented as a known
  limitation (deferred to the deployment phase).

### Known limitations (Phase 11C — not a production claim)

- No physical USB/RTSP camera was available in the development environment;
  connectivity was proven with a real video-file source through the **real**
  OCR pipeline into the **real** API and database (see the live-run section of
  `services/vision/README.md`). CameraSource's USB/RTSP open/read/close paths
  are unit-tested against mocks and OpenCV API contracts only.
- CameraSource runtime configuration is per-process/file: multi-camera
  management, dynamic reload, and distributed source provisioning are Phase 15.
- Real-time streaming/WebSockets/SSE to clients remain Phase 12.
- Formal OCR accuracy (precision/recall/CER) remains Phase 14.
