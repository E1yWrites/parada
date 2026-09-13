import os

# Same env var name and default the existing API config reads
# (services/api/src/config/env.ts / packages/config DEFAULT_OCR_CONFIDENCE_THRESHOLD).
# Vision does not enforce this threshold itself — that decision belongs to
# OccupancyService.isPlateTrusted, the one authoritative path. It is read
# here only to attach an informational classification to logs/responses.
DEFAULT_OCR_CONFIDENCE_THRESHOLD = 0.5


def get_ocr_confidence_threshold() -> float:
    raw = os.environ.get("OCR_PLATE_CONFIDENCE_THRESHOLD")
    if raw is None:
        return DEFAULT_OCR_CONFIDENCE_THRESHOLD
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_OCR_CONFIDENCE_THRESHOLD
    if not (0.0 <= value <= 1.0):
        return DEFAULT_OCR_CONFIDENCE_THRESHOLD
    return value


# Hard cap on an uploaded frame's size to protect the service from
# oversized/malicious payloads (section 57). 8 MiB comfortably covers a
# compressed camera frame.
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Where the normalized event gets forwarded when a caller opts in via
# POST /detect?forward=true. Vision never talks to Prisma/PostgreSQL directly;
# this is the one and only downstream call it is allowed to make.
PARADA_API_URL = os.environ.get("PARADA_API_URL", "http://localhost:4100")
CAMERA_API_KEY = os.environ.get("CAMERA_API_KEY")

# ---------------------------------------------------------------------------
# Physical camera source (Phase 11C). These select WHICH frame source the
# runtime reads from; the logical camera identity (identifier/zone/direction/
# status) stays authoritative in the database and is resolved by the API at
# event time. Only non-secret source *location* is read here; credentials for
# RTSP are supplied separately at open() time and never logged or persisted.
# ---------------------------------------------------------------------------

# Source type: "usb" | "rtsp" | "file". Defaults to "file" so the runtime is
# deterministic and CI-safe with no hardware attached.
CAMERA_SOURCE = os.environ.get("CAMERA_SOURCE", "file")

# USB / video-file device index or path. For "file" this is the path to a
# fixture video; for "usb" it is the device index (0, 1, 2, ...).
CAMERA_DEVICE_INDEX = int(os.environ.get("CAMERA_DEVICE_INDEX", "0"))
CAMERA_FILE_PATH = os.environ.get("CAMERA_FILE_PATH", "")

# Fully-qualified capture target passed to OpenCV VideoCapture. For RTSP this
# is rtsp://host/path (credentials may be embedded here but are only ever used
# at open() time and never serialized into logs/responses).
VIDEO_SOURCE = os.environ.get("VIDEO_SOURCE", "")

# The LOGICAL camera identifier this source feeds (e.g. CAM-A01). Used to
# build the API event's cameraIdentifier and to map the observation to a zone
# through the API; the API is the authority on camera-zone-direction.
CAMERA_IDENTIFIER = os.environ.get("CAMERA_IDENTIFIER", "CAM-A01")

# The zone this camera is configured under in Admin. REQUIRED for `run`: the
# API's only ingestion endpoint is POST /zones/:zoneId/events, and it then
# verifies that CAMERA_IDENTIFIER really belongs to that zone (409 otherwise),
# so the mapping stays authoritative in the database.
CAMERA_ZONE_ID = os.environ.get("CAMERA_ZONE_ID", "")

# Frame-rate ceiling. A webcam may deliver 30-60 FPS but we must not run
# OCR at that rate; process at most this many frames per second.
VISION_PROCESS_FPS = float(os.environ.get("VISION_PROCESS_FPS", "2"))

# Observation cooldown (seconds): suppress re-emitting the SAME camera + SAME
# normalized plate + SAME direction within this window (debounce, section 17).
OBSERVATION_COOLDOWN_SECONDS = float(os.environ.get("OBSERVATION_COOLDOWN_SECONDS", "5"))

# Reconnect / retry policy when a source or the API is temporarily unavailable.
CAMERA_RECONNECT_DELAY_SECONDS = float(os.environ.get("CAMERA_RECONNECT_DELAY_SECONDS", "2"))
MAX_CONSECUTIVE_READ_FAILURES = int(os.environ.get("MAX_CONSECUTIVE_READ_FAILURES", "10"))
# Upper bound on reconnect attempts before the camera is marked unrecoverable
# and the runtime stops (failure isolation — it never crashes the process).
MAX_CAMERA_RECONNECTS = int(os.environ.get("MAX_CAMERA_RECONNECTS", "100"))
