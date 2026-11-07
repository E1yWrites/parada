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


def _env_unit_float(name: str, default: float) -> float:
    """A [0..1] float from the environment; missing/invalid/out-of-range -> default."""
    try:
        value = float(os.environ.get(name, default))
    except ValueError:
        return default
    return value if 0.0 <= value <= 1.0 else default


# Vision's OWN noise floor, separate from OCR_PLATE_CONFIDENCE_THRESHOLD above:
# readings below this are dropped before they are ever reported, because at that
# level they are mostly background text (signs, boxes) rather than plates. The
# API still makes the trust decision on everything above it.
DEFAULT_VISION_MIN_OCR_CONFIDENCE = 0.4
VISION_MIN_OCR_CONFIDENCE = _env_unit_float("VISION_MIN_OCR_CONFIDENCE", DEFAULT_VISION_MIN_OCR_CONFIDENCE)

# When set, every frame with plate candidates saves its OCR input crops and the
# OCR text to a sub-folder here, to see what the camera actually reads. Off by
# default; it writes several files per processed frame.
VISION_DEBUG_DIR = os.environ.get("VISION_DEBUG_DIR", "").strip()

# Full-frame OCR fallback: when the classical plate detector boxes nothing
# readable, run EasyOCR's own text detector over the whole frame. Costs about
# one extra OCR pass per frame without a plate; set VISION_FULL_FRAME_OCR=0 to
# turn it off.
VISION_FULL_FRAME_OCR = os.environ.get("VISION_FULL_FRAME_OCR", "1").strip().lower() not in ("0", "false", "no", "off")
# Longest side the frame is scaled to for full-frame OCR (speed vs. small plates).
FULL_FRAME_OCR_MAX_DIM = max(320, int(os.environ.get("FULL_FRAME_OCR_MAX_DIM", "960")))
# With full-frame OCR on, only this many detector boxes are still OCR'd one by one.
MAX_CANDIDATES_WITH_FULL_FRAME = max(0, int(os.environ.get("MAX_CANDIDATES_WITH_FULL_FRAME", "2")))

# Hard cap on an uploaded frame's size to protect the service from
# oversized/malicious payloads (section 57). 8 MiB comfortably covers a
# compressed camera frame.
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Where the normalized event gets forwarded when a caller opts in via
# POST /detect?forward=true. Vision never talks to Prisma/PostgreSQL directly;
# this is the one and only downstream call it is allowed to make.
# 127.0.0.1, not localhost: on Windows localhost resolves to ::1 first while the
# API listens on IPv4, costing ~2 s per fresh connection (phase14-evaluation.md).
PARADA_API_URL = os.environ.get("PARADA_API_URL", "http://127.0.0.1:4100")
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

# Direction this runtime reports: ENTRY or EXIT (default ENTRY). One runtime
# feeds one gate camera, so it must match the gate type set in Admin ->
# Cameras; the API still rejects a direction the camera does not allow.
CAMERA_EVENT_TYPE = os.environ.get("CAMERA_EVENT_TYPE", "ENTRY").strip().upper()

# Frame-rate ceiling. A webcam may deliver 30-60 FPS but we must not run
# OCR at that rate; process at most this many frames per second.
VISION_PROCESS_FPS = float(os.environ.get("VISION_PROCESS_FPS", "2"))

# Duplicate suppression (debounce, section 17) for the SAME camera + SAME
# normalized plate + SAME direction is presence-based: after a send, the plate
# is ignored while it keeps appearing in frames, so a car waiting at the gate
# is counted once however long it waits (a fixed 5 s window counted one car
# 2-3 times in live testing). Once it has not been read for
# OBSERVATION_ABSENCE_RESET_SECONDS, its next confirmed read is a new pass.
# OBSERVATION_COOLDOWN_SECONDS is the hard minimum between two sends.
# 25 s: a live frame takes ~6 s on CPU, so one misread frame already leaves a
# 12 s gap; 10 s turned that gap into a second event in the day test.
OBSERVATION_COOLDOWN_SECONDS = float(os.environ.get("OBSERVATION_COOLDOWN_SECONDS", "5"))
OBSERVATION_ABSENCE_RESET_SECONDS = float(os.environ.get("OBSERVATION_ABSENCE_RESET_SECONDS", "25"))

# Plate confirmation: a plate is only forwarded once it was read the SAME way in
# at least PLATE_CONFIRM_MIN_READS of the last PLATE_CONFIRM_WINDOW processed
# frames. A one-off misread of background text never reaches the API; a real
# car in front of the camera is read repeatedly. PLATE_CONFIRM_MIN_READS=1
# turns confirmation off.
PLATE_CONFIRM_WINDOW = max(1, int(os.environ.get("PLATE_CONFIRM_WINDOW", "3")))
PLATE_CONFIRM_MIN_READS = max(1, int(os.environ.get("PLATE_CONFIRM_MIN_READS", "2")))
# ...except a single read at or above this OCR confidence is forwarded at once
# (0 = always wait for confirmation). Misreads of background text are mostly
# far below it, and the plate-format filter still applies.
PLATE_CONFIRM_SKIP_CONFIDENCE = _env_unit_float("PLATE_CONFIRM_SKIP_CONFIDENCE", 0.9)

# Reconnect / retry policy when a source or the API is temporarily unavailable.
CAMERA_RECONNECT_DELAY_SECONDS = float(os.environ.get("CAMERA_RECONNECT_DELAY_SECONDS", "2"))
MAX_CONSECUTIVE_READ_FAILURES = int(os.environ.get("MAX_CONSECUTIVE_READ_FAILURES", "10"))
# Total HTTP attempts per event for retryable answers (429/5xx/transport),
# re-sending the SAME sourceEventId so the API's unique constraint absorbs a
# commit whose response was lost. One event in flight at a time; 1 disables
# retries. Kept small on purpose: the frame loop blocks while it retries.
MAX_FORWARD_ATTEMPTS = max(1, int(os.environ.get("MAX_FORWARD_ATTEMPTS", "3")))
# Upper bound on reconnect attempts before the camera is marked unrecoverable
# and the runtime stops (failure isolation — it never crashes the process).
MAX_CAMERA_RECONNECTS = int(os.environ.get("MAX_CAMERA_RECONNECTS", "100"))
