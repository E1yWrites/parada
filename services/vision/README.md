# PARADA Vision Service — Phase 11 (Real OCR / Computer Vision)

A real, executable computer-vision pipeline: camera image → license-plate
detection → OCR → normalized plate → confidence → a canonical vision event
handed off to the existing PARADA API. This service is a producer of vision
results, never a database client — see "Architecture" below.

## Model / Runtime

| Stage | Implementation | Notes |
|---|---|---|
| Plate detection | Classical OpenCV (blackhat morphology + Sobel gradient + Otsu threshold + aspect-ratio-filtered contours) | No neural network, no weights, deterministic, CPU-only |
| OCR | [EasyOCR](https://github.com/JaidedAI/EasyOCR) 1.7.2 (CRAFT detector + CRNN recognizer, PyTorch backend) | Apache-2.0. Models cached at `~/.EasyOCR/model` (~94MB: `craft_mlt_25k.pth` ~20MB, `english_g2.pth` ~74MB), downloaded once on first run, never committed to the repo |
| Service boundary | FastAPI + Uvicorn | `POST /detect`, `GET /health` |

**Why EasyOCR instead of the PaddleOCR/Tesseract options `docs/vision/architecture.md` originally floated:** this sandbox had no `sudo`, so the `tesseract` binary `pytesseract` requires could not be installed, and PaddleOCR's install footprint was heavier and less reliable under the ~1-2GB of free RAM available at build time. EasyOCR is pip-only, self-contained, and gives real per-result recognition confidence. Full rationale in `docs/vision/architecture.md`.

**CPU support:** yes, this is the default and what was tested (`gpu=False`).
**GPU support:** EasyOCR/torch will use CUDA automatically if `gpu=True` is passed and a CUDA-capable torch build is installed; not required or configured here — CPU is the supported path for this phase.

## Setup

**Linux/macOS/WSL:**
```bash
cd services/vision
python3 -m venv --without-pip .venv   # or: python3 -m venv .venv, if ensurepip works on your machine
curl -sS https://bootstrap.pypa.io/get-pip.py | .venv/bin/python3   # only needed for the --without-pip path
.venv/bin/pip install -r requirements.txt
```

**Windows (native, no WSL) or cross-platform:**
```bash
npm run setup -w @parada/vision
```
This runs `scripts/setup-venv.cjs`, which creates `.venv` with its bundled pip
(auto-detecting `python`/`python3`/`py` on PATH) and installs
`requirements.txt` — equivalent to the manual steps above but works on both
Windows (`.venv\Scripts\`) and POSIX (`.venv/bin/`) without a separate
get-pip.py bootstrap.

Run the service:
```bash
.venv/bin/uvicorn app.main:app --port 8001   # Linux/macOS/WSL, direct venv invocation
# or, cross-platform (resolves .venv/bin vs .venv\Scripts automatically):
npm run dev -w @parada/vision
```

Run tests:
```bash
.venv/bin/pytest   # Linux/macOS/WSL, direct venv invocation
# or, cross-platform:
npm run test -w @parada/vision
```

The first run of either the service or the real-inference tests downloads
the EasyOCR models (~94MB) to `~/.EasyOCR`; subsequent runs are fast.

## API

### `GET /health`
```json
{"status": "ok", "modelLoaded": true}
```
Reports `"unhealthy"`/`modelLoaded: false` if the OCR model failed to load at
startup — the service never silently falls back to fake OCR.

### `POST /detect` (multipart/form-data)

| Field | Required | Notes |
|---|---|---|
| `image` | yes | the camera frame, any format OpenCV can decode; max 8MB |
| `cameraIdentifier` | yes | passed through unchanged |
| `eventType` | yes | `ENTRY` or `EXIT` — vision does not decide this, the caller does (camera gate config is authoritative, per existing API) |
| `zoneId` | only if `forward=true` | |
| `detectedAt` | no | ISO date string; defaults to now (UTC) |
| `forward` | no | if `true`, also POSTs the resulting event to the existing API's `POST /zones/:zoneId/events` |

Response:
```json
{
  "sourceEventId": "vision-3f2a...",
  "cameraIdentifier": "CAM-1",
  "eventType": "ENTRY",
  "detectedPlate": "ABC1234",
  "normalizedPlate": "ABC1234",
  "ocrConfidence": 0.997,
  "detectedAt": "2026-09-07T02:10:00+00:00",

  "status": "DETECTED",
  "detectionConfidence": 0.70,
  "candidatesConsidered": 1,
  "processingMs": 86.1
}
```

`sourceEventId` is a SHA-256 hash of the image bytes + `cameraIdentifier` —
identical retries of the same physical observation produce the same id, so
the API's `(cameraId, sourceEventId)` unique constraint absorbs duplicates
instead of double-counting. Both ingress paths (`/detect` and the camera
runtime loop) derive it from the same helper, `app/event_identity.py`, so one
observation has one id no matter which path reports it.

The first 6 fields exactly match `NormalizedVisionEvent`
(`services/api/src/domain/occupancy.ts`) — that's what gets forwarded when
`forward=true`. The remaining fields are vision-only diagnostics, dropped
before forwarding.

`status` is one of:
- `DETECTED` — a plate-shaped region was found and OCR read text from it.
- `NO_DETECTION` — no plate-shaped region was found in the frame at all.
- `OCR_FAILED` — a region was found, but OCR could not read reliable text
  from any candidate. Never falls back to a guessed/fabricated plate.

`ocrConfidence` is not compared against a threshold inside vision —
`OCR_PLATE_CONFIDENCE_THRESHOLD` / `DEFAULT_OCR_CONFIDENCE_THRESHOLD` (0.5)
is read from the same env var name purely so the two services agree on the
value; the actual trust decision (`isPlateTrusted`) remains solely in
`OccupancyService`, per the "one authoritative configuration path"
requirement.

**Multiple plate candidates:** the detector returns candidates sorted by
detection confidence; OCR is attempted on the strongest candidate first, and
the first one that yields readable text (≥2 normalized characters) wins.
This is deterministic (same image → same result every time) and never
blends text across candidates.

## Architecture boundary

```
Camera → Vision (this service) → existing API → OccupancyService → Database
```

Vision **does not** import Prisma, `@parada/database`, or connect to
PostgreSQL — `app/api_client.py` is the only downstream call it makes, and
it's a plain HTTP POST to the existing API using the same `X-API-Key` camera
auth the API already enforces. Vision does not decide guest admission,
capacity, fees, violations, or wrong-zone status — it only reports what the
image shows.

## Known limitations (Phase 11 — not a formal accuracy phase)

- The classical detector is tuned against roughly rectangular, non-occluded
  plate regions; it was validated on the synthetic fixtures in
  `tests/fixtures/images/` (see `generate_fixtures.py` — programmatically
  drawn, not real vehicle photos, so no licensing concern), not real-world
  camera footage from varied angles/lighting/plate designs.
- Phase 14 measured this pipeline on a 1250-image synthetic benchmark and probed
  two real USB webcams (connectivity + live false-positive behaviour only; no plate
  was presented). Results, method and limitations: `docs/vision/phase14-evaluation.md`;
  harness: `evaluation/` (`python -m evaluation.dataset`, `python -m evaluation.run_ocr_eval`,
  `python -m evaluation.run_e2e_latency`, `python -m evaluation.run_camera_probe`).

## Measured performance (this sandbox: 16 vCPU, CPU-only inference, no GPU used)

- Model load (first `get_ocr_engine()` call, cold): **~4.95s**
- Per-image inference (`process_image`, warm model, 800×600 synthetic frame): **~85-145ms** (first call after load ~376ms includes JIT/cache warmup)
- These are measured, not estimated — reproduce with the snippet in this repo's implementation notes or by timing `pytest tests/test_real_inference_smoke.py -q`.

---

# Phase 11C — Physical Camera Provisioning & Vision Connectivity

Phase 11C connects the logical camera configuration (Phase 11A: identifier /
zone / direction / status stored in the database) to an **actual frame source**.
All new code is Python in this service — there is **no** DB schema change, no
new API route, and no Admin/Mobile change. Camera credentials stay server-side
and never enter the database, an API response, or a log.

## Source selection (environment, trusted server-side config only)

| Variable | Default | Meaning |
|---|---|---|
| `CAMERA_SOURCE` | `file` | `usb` \| `rtsp` \| `file` |
| `CAMERA_DEVICE_INDEX` | `0` | USB device index (`0, 1, 2, ...`) |
| `CAMERA_FILE_PATH` | (empty) | path to a video fixture for `file` |
| `VIDEO_SOURCE` | (empty) | `rtsp://` URL for `rtsp` |
| `CAMERA_IDENTIFIER` | `CAM-A01` | the LOGICAL camera this source feeds (join key to the API) |
| `CAMERA_ZONE_ID` | (empty) | **required for `run`** — the zone the camera is configured under. The API's only ingestion route is `POST /zones/:zoneId/events`; it then verifies the camera really belongs to that zone (409 otherwise). `run` refuses to start without it |
| `VISION_PROCESS_FPS` | `2` | processing ceiling — frames above this are not OCR'd |
| `OBSERVATION_COOLDOWN_SECONDS` | `5` | same camera + same plate + same direction within this window = one observation |
| `CAMERA_RECONNECT_DELAY_SECONDS` | `2` | backoff between reconnect attempts |
| `MAX_FORWARD_ATTEMPTS` | `3` | total HTTP attempts per event on `429`/`5xx`/transport failure, re-sending the same `sourceEventId`; `1` disables retries |
| `MAX_CAMERA_RECONNECTS` | `100` | reconnect ceiling; beyond this the camera stops (no crash) |

The API connection uses the existing `PARADA_API_URL` (default
`http://localhost:4100`) and `CAMERA_API_KEY` (`X-API-Key` header). **No user or
admin JWT is used.**

## USB development

1. Plug in the USB webcam and find its index:
   ```bash
   ls /dev/video*                 # Linux/macOS/WSL, e.g. /dev/video0 -> index 0
   ```
   On native Windows there is no `/dev/video*`; OpenCV enumerates cameras by
   integer index directly (`CAMERA_DEVICE_INDEX=0` is usually the default
   webcam) — use the Windows Camera app or Device Manager to confirm which
   physical camera maps to which index if more than one is attached.
2. Configure the runtime source (bash/WSL — inline `VAR=value` env prefix):
   ```bash
   CAMERA_SOURCE=usb CAMERA_DEVICE_INDEX=0 CAMERA_IDENTIFIER=CAM-A01 \
     CAMERA_ZONE_ID=<zoneId> \
     PARADA_API_URL=http://localhost:4100 CAMERA_API_KEY=<key> \
     npm run camera -w @parada/vision -- test
   ```
   PowerShell (native Windows) — set env vars first, then run:
   ```powershell
   $env:CAMERA_SOURCE="usb"; $env:CAMERA_DEVICE_INDEX="0"; $env:CAMERA_IDENTIFIER="CAM-A01"
   $env:CAMERA_ZONE_ID="<zoneId>"
   $env:PARADA_API_URL="http://localhost:4100"; $env:CAMERA_API_KEY="<key>"
   npm run camera -w @parada/vision -- test
   ```
3. Start the full loop (bash/WSL):
   ```bash
   CAMERA_SOURCE=usb CAMERA_DEVICE_INDEX=0 CAMERA_IDENTIFIER=CAM-A01 \
     CAMERA_ZONE_ID=<zoneId> \
     PARADA_API_URL=http://localhost:4100 CAMERA_API_KEY=<key> \
     npm run camera -w @parada/vision -- run
   ```
   PowerShell equivalent: set the same `$env:...` variables as above (omit
   `CAMERA_ZONE_ID` if unset), then run
   `npm run camera -w @parada/vision -- run`.
4. Success looks like: `vision runtime started camera=CAM-A01 source=usb fps=2.00`
   followed by `event ... outcome=ok` lines; the zone's `occupiedCount` in the
   Admin Dashboard increases only for accepted (201) events.

> Real USB hardware was **not available** in this development environment, so
> the USB path is UNIT-tested (open/read/close/resolution/failure) against
> mocks + OpenCV's `VideoCapture` API contract. Physical-camera connectivity is
> proven via the video-file source (below), which drives the **identical**
> pipeline.

## Video-file testing (deterministic, no hardware)

```bash
# generate the 10-frame fixture clip once
.venv/bin/python tests/fixtures/generate_video.py

CAMERA_SOURCE=file CAMERA_FILE_PATH=tests/fixtures/videos/clear_plate.mp4 \
  CAMERA_IDENTIFIER=CAM-A01 CAMERA_ZONE_ID=<zoneId> \
  PARADA_API_URL=http://localhost:4100 CAMERA_API_KEY=<key> \
  npm run camera -w @parada/vision -- run
```

The clip alternates a clear plate (`ABC1234`) and a no-plate frame, so the
`test` mode reports `plate read : ABC1234 (conf 1.00)` and the `run` mode
produces a single accepted ENTRY (the 9 identical frames collapse into one
observation after debounce + the API's idempotency key). End-of-stream stops
the loop cleanly.

## RTSP

```bash
CAMERA_SOURCE=rtsp VIDEO_SOURCE=rtsp://10.0.0.15:554/stream1 CAMERA_IDENTIFIER=CAM-A01 \
  CAMERA_ZONE_ID=<zoneId> \
  PARADA_API_URL=http://localhost:4100 CAMERA_API_KEY=<key> \
  npm run camera -w @parada/vision -- test
```

- Only `rtsp://` / `rtsps://` URLs are accepted.
- If credentials are needed they are embedded in the URL and used only at
  `open()`; the URL is **redacted** (scheme/host/port only) from every
  response/log.
- An unreachable stream raises a clean error (`RTSP stream could not be
  opened (unreachable or refused).`) and the runtime backs off and retries up
  to `MAX_CAMERA_RECONNECTS` rather than crashing.
- No real RTSP hardware was available for testing; behavior is unit-tested
  against the OpenCV API contract + redaction tests.

## Camera registration (logical mapping)

Create/verify the logical camera in Admin → Cameras (or `POST /admin/cameras`):
identifier `CAM-A01`, a zone, a direction (`ENTRY`/`EXIT`/`BIDIRECTIONAL`),
status `ONLINE`. The runtime's `CAMERA_IDENTIFIER` must match that identifier —
the event's `cameraIdentifier` is the join key, and the API validates
zone/camera/direction/status itself (no duplication in Vision).

## Security

- RTSP credentials and the API key live **only** in the runtime environment.
  The database holds no credentials; Admin responses never include them.
- Vision authenticates to the API exclusively via the shared `CAMERA_API_KEY`
  (the existing `X-API-Key` mechanism). It never holds user/admin tokens.
- No frames are persisted or uploaded; processing is fully in-memory.
- Source selection is trusted environment config — there is no endpoint that
  accepts "connect to this URL", so there is no SSRF surface.
- This repository has no secure-secret-store system; credential handling is
  documented as env-based and deferred-secret-management is Phase 15.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `USB camera device 0 could not be opened` | No device at that index, or permission denied. Check `ls /dev/video*`; try `CAMERA_DEVICE_INDEX=1`. |
| `RTSP stream could not be opened` | Wrong URL/host/path, or stream requires auth. Verify `VIDEO_SOURCE` is `rtsp://...` and reachable. |
| `Video file not found: ...` | `CAMERA_FILE_PATH` is empty/mistyped; `generate_video.py` was not run. |
| `OCR model is not loaded` / health `unhealthy` | EasyOCR weights missing or failed to load; check `~/.EasyOCR` and re-run setup. |
| `configuration error: CAMERA_ZONE_ID (or --zone-id) is required` | `run` needs the zone the camera is configured under (Admin → Cameras). Without it every event would target `/zones/None/events` and be rejected. |
| `api event error status=401` | `CAMERA_API_KEY` does not match the API's key (or the API enforces one but none is set). This is a **config** error, not an auth-vs-Vision issue. |
| `api unreachable (ConnectError); backing off` | The API is down or `PARADA_API_URL` is wrong. The runtime keeps reading frames and retries each new observation after `CAMERA_RECONNECT_DELAY_SECONDS`; it never crashes on a transport failure. |
| `api rejected event status=409 reason=Duplicate camera event` | Normal: the same physical observation was re-sent; the API's idempotency key absorbed it. Not an error. |
| `api throttled event (429)` | The API's camera rate limit was hit; runtime backs off automatically (bounded). |
| Camera stops after `MAX_CAMERA_RECONNECTS` | The source is genuinely gone; the runtime isolates it (does not crash) and exits cleanly. Check the physical connection. |

## Tests added (Phase 11C)

- `tests/test_camera_sources.py` — USB/RTSP/file construction + validation,
  URL redaction, factory env selection, missing-file/path errors (14 tests).
- `tests/test_camera_runtime.py` — debounce, direction independence, 429/409/5xx
  handling, bounded reconnect, EOF stop, clean shutdown, deterministic
  sourceEventId (11 tests).
- `tests/test_camera_cli.py` — real CLI `test`/`run` over the real video
  fixture through the real OCR pipeline with a mocked API, plus the exact
  `POST /zones/:id/events` contract (4 tests).
- `tests/test_vision_to_api_integration.py` — added an opt-in full-pipeline test
  (SOURCE→VISION→API→CAMERA VALIDATION→OCCUPANCY→DB) that needs a live API
  (`PARADA_TEST_API_URL` etc., same convention as the pre-existing test).

A live full-pipeline proof was run during development (see
`docs/vision/architecture.md` → "Phase 11C"): a real Mp4 fixture →
real EasyOCR (`ABC1234`, conf 1.00) → `POST /zones/:id/events` (201) → the
zone's `occupiedCount` incremented exactly once despite repeated identical
frames (backend idempotency).
