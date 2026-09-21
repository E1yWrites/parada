# How to add a camera

Adding a camera has two parts: registering it in the admin dashboard (logical
mapping stored in the database) and pointing an actual frame source at it in
the vision service. Both are required — one without the other does nothing.

## 1. Register the logical camera (Admin)

1. Sign in to the admin dashboard and open **Cameras** (`/cameras`).
2. Click **Register camera** and fill in:
   - **Camera identifier** — stable, unique id fed to the vision pipeline
     (e.g. `CAM-A01`). Cannot be changed after creation.
   - **Associated zone** — the zone this camera's gate belongs to.
   - **Gate direction** — `ENTRY`, `EXIT`, or `BIDIRECTIONAL`.
   - **Status** — `ONLINE` (accepts events) or `OFFLINE`.
   - **Display name** / **Location** — optional, informational only.
3. Submit. This calls `POST /admin/cameras` (see
   [`services/api/src/routes/admin.ts`](../../services/api/src/routes/admin.ts)),
   which is backend-authoritative — direction, zone membership, and status are
   enforced server-side on every incoming event, not decided by vision.

Equivalent API call:

```bash
curl -X POST http://localhost:4100/admin/cameras \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin session cookie>" \
  -d '{"identifier":"CAM-A01","zoneId":"<zoneId>","gateType":"ENTRY","status":"ONLINE"}'
```

## 2. Point a frame source at it (Vision)

The vision service (`services/vision`) needs to know where frames for that
`CAM-A01` identifier come from: a USB device, an RTSP stream, or a video file.
This is environment configuration only — no DB schema change, no API change.

**`services/api`'s `CAMERA_API_KEY` alone is not enough.** It only
authenticates vision's HTTP calls to the API — it says nothing about which
physical device to read frames from. That's a separate set of variables,
local to `services/vision`, with no defaults for the values that matter
(`CAMERA_IDENTIFIER`, `CAMERA_ZONE_ID`, the source itself). Copy
[`services/vision/.env.example`](../../services/vision/.env.example) to
`services/vision/.env` and fill it in — every variable is documented there.
Note that vision reads the process environment only (no dotenv loader), so
export the file before starting it (`set -a; . ./.env; set +a`) or point a
systemd `EnvironmentFile=` / container env at it:

| Variable | Meaning |
|---|---|
| `CAMERA_SOURCE` | `usb` \| `rtsp` \| `file` |
| `CAMERA_IDENTIFIER` | must match the identifier registered in step 1 |
| `CAMERA_ZONE_ID` | the zone id the camera is configured under (required for `run`) |
| `CAMERA_DEVICE_INDEX` | USB device index, if `CAMERA_SOURCE=usb` |
| `VIDEO_SOURCE` | `rtsp://...` URL, if `CAMERA_SOURCE=rtsp` |
| `CAMERA_FILE_PATH` | path to a video fixture, if `CAMERA_SOURCE=file` |
| `PARADA_API_URL` | API base URL (default `http://localhost:4100`) |
| `CAMERA_API_KEY` | shared `X-API-Key` credential, must match the API's `CAMERA_API_KEY` |

Plus tuning/resilience variables (`VISION_PROCESS_FPS`,
`OBSERVATION_COOLDOWN_SECONDS`, `CAMERA_RECONNECT_DELAY_SECONDS`,
`MAX_CONSECUTIVE_READ_FAILURES`, `MAX_FORWARD_ATTEMPTS`,
`MAX_CAMERA_RECONNECTS`) and `OCR_PLATE_CONFIDENCE_THRESHOLD`, which must
match the same value set in `services/api/.env` — defaults are fine unless
you have a specific reason to change them.

Example (USB, bash/WSL):

```bash
CAMERA_SOURCE=usb CAMERA_DEVICE_INDEX=0 CAMERA_IDENTIFIER=CAM-A01 \
  CAMERA_ZONE_ID=<zoneId> \
  PARADA_API_URL=http://localhost:4100 CAMERA_API_KEY=<key> \
  npm run camera -w @parada/vision -- run
```

Full setup, RTSP/video-file examples, and troubleshooting table:
[`services/vision/README.md`](../../services/vision/README.md) (search
"Phase 11C").

## Verify

- Vision log line: `vision runtime started camera=CAM-A01 source=usb fps=2.00`
  followed by `event ... outcome=ok`.
- Admin **Cameras** page shows a recent event for that camera.
- The zone's `occupiedCount` on the admin dashboard increases only for
  accepted (`201`) events — repeated identical frames are absorbed by the
  API's idempotency key, not double-counted.

## Common mistakes

- `CAMERA_IDENTIFIER` in vision doesn't match the identifier registered in
  Admin → the API rejects events for an unknown camera.
- Camera registered but zone doesn't match `CAMERA_ZONE_ID` → API returns
  `409` (camera doesn't belong to that zone).
- Camera **status** left `OFFLINE` in Admin → events are rejected even if the
  vision runtime is running fine.
