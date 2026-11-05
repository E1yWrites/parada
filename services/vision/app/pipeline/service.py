"""Orchestrates: decode -> preprocess -> detect -> crop -> OCR -> normalize.

No business logic lives here (no guest policy, no fee, no violation, no
occupancy/session decisions) — this module only answers "what does the
camera image show", matching the architecture boundary in
docs/vision/architecture.md and services/api's OccupancyService, which
remains the sole place that interprets a plate into parking state.
"""

import os
import re
import time
from dataclasses import dataclass
from enum import Enum

from .. import config
from .debug import FrameDebug
from .debug import start_frame as start_debug_frame
from .detector import detect_plate_candidates
from .normalize import normalize_plate
from .ocr import read_plate_text, read_text_lines
from .preprocessing import decode_image, enhance_for_ocr, resize_if_needed

MIN_PLATE_TEXT_LENGTH = 2  # shorter than this is noise, not a plate reading

# Plate format filter. A live camera sees plenty of plate-shaped things with
# letters on them (posters, boxes, shirts); without a format check every such
# misread ("LMAT", "LEE") was forwarded as a car. Only readings that match this
# pattern are reported. Default: Philippine plates, 3 letters + 3 or 4 digits
# (ABC 123 / ABC 1234). Override with PLATE_PATTERN (a regex over the
# normalized A-Z0-9 text); set PLATE_PATTERN="" to turn the filter off.
DEFAULT_PLATE_PATTERN = r"[A-Z]{3}[0-9]{3,4}"
_PLATE_PATTERN_SOURCE = os.environ.get("PLATE_PATTERN", DEFAULT_PLATE_PATTERN).strip()
PLATE_PATTERN = re.compile(rf"^(?:{_PLATE_PATTERN_SOURCE})$") if _PLATE_PATTERN_SOURCE else None

# Common OCR confusions, applied by position for the default PH format only:
# the first 3 characters must be letters, the rest digits.
_TO_LETTER = str.maketrans({"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "8": "B"})
_TO_DIGIT = str.maketrans(
    {"O": "0", "Q": "0", "D": "0", "U": "0", "I": "1", "L": "1", "T": "1", "Z": "2", "S": "5", "G": "6", "B": "8"}
)

# How many padded re-reads (see _padded_crop) one frame may spend, to bound latency.
MAX_PADDED_REREADS = 2


_GROUP = re.compile(r"[A-Z0-9]+")
_DIGIT_RUN = re.compile(r"[0-9]+")


def _match_groups(groups: list[str]) -> str | None:
    """Default PH format over a reading split into groups ("CDI 6227"): a group
    of exactly 3 letters followed by a group of 3+ digits, each corrected only
    within itself. Characters never move between groups, so "CD 6227" is
    rejected instead of becoming "CDG227"."""
    for letters, digits in zip(groups, groups[1:]):
        if len(letters) != 3:
            continue
        letters = letters.translate(_TO_LETTER)
        run = _DIGIT_RUN.match(digits.translate(_TO_DIGIT))
        if not letters.isalpha() or run is None or len(run.group()) < 3:
            continue
        # A stray character after the number is dropped: "CDI 62271" -> "CDI6227".
        plate = letters + run.group()[:4]
        if PLATE_PATTERN.match(plate):
            return plate
    return None


def match_plate(reading: str) -> str | None:
    """Return the plate found in an OCR reading (raw or normalized), or None.

    For the default PH format, a reading split into groups (by spaces or
    other separators, "CDI 6227") is matched group by group; see
    _match_groups. A single unbroken group is tried, in order: whole; any 7-
    then 6-character window of it (drops stray characters picked up next to
    the plate, e.g. "IABC1234"); and the same windows with letter/digit
    confusions corrected by position ("ABCI234" -> "ABC1234").
    """
    groups = _GROUP.findall(reading.upper())
    normalized = "".join(groups)
    if PLATE_PATTERN is None:
        return normalized if len(normalized) >= MIN_PLATE_TEXT_LENGTH else None
    correct = _PLATE_PATTERN_SOURCE == DEFAULT_PLATE_PATTERN
    if correct and len(groups) > 1:
        return _match_groups(groups)
    if PLATE_PATTERN.match(normalized):
        return normalized
    # Longer windows first, so "ABCI234" becomes "ABC1234", not the shorter "BCI234".
    for length in (7, 6):
        windows = [normalized[start : start + length] for start in range(0, len(normalized) - length + 1)]
        for window in windows:
            if PLATE_PATTERN.match(window):
                return window
        if correct:
            for window in windows:
                fixed = window[:3].translate(_TO_LETTER) + window[3:].translate(_TO_DIGIT)
                if PLATE_PATTERN.match(fixed):
                    return fixed
    return None


def display_plate(plate: str) -> str:
    """How the plate is reported and shown on the site: "DAB1245" -> "DAB 1245"
    for the default PH format. The API strips spaces before matching, so EXIT
    still finds the ENTRY."""
    if _PLATE_PATTERN_SOURCE == DEFAULT_PLATE_PATTERN and PLATE_PATTERN is not None and PLATE_PATTERN.match(plate):
        return f"{plate[:3]} {plate[3:]}"
    return plate


def _padded_crop(candidate, image):
    """The candidate region widened to each side. The classical detector often
    boxes only one half of a plate ("ABC" without "1234", because of the gap
    between the groups); re-reading a wider strip recovers the whole plate."""
    img_h, img_w = image.shape[:2]
    pad_x = int(candidate.w * 1.5)
    pad_y = int(candidate.h * 0.5)
    x0 = max(0, candidate.x - pad_x)
    y0 = max(0, candidate.y - pad_y)
    x1 = min(img_w, candidate.x + candidate.w + pad_x)
    y1 = min(img_h, candidate.y + candidate.h + pad_y)
    return image[y0:y1, x0:x1]


class DetectionStatus(str, Enum):
    DETECTED = "DETECTED"
    NO_DETECTION = "NO_DETECTION"
    OCR_FAILED = "OCR_FAILED"


@dataclass(frozen=True)
class VisionResult:
    status: DetectionStatus
    detected_plate: str | None
    normalized_plate: str | None
    ocr_confidence: float | None
    detection_confidence: float | None
    candidates_considered: int


def process_image(image_bytes: bytes) -> VisionResult:
    image = decode_image(image_bytes)  # raises ValueError on invalid/corrupt input
    image = resize_if_needed(image)

    candidates = detect_plate_candidates(image)
    if not candidates and not config.VISION_FULL_FRAME_OCR:
        return VisionResult(
            status=DetectionStatus.NO_DETECTION,
            detected_plate=None,
            normalized_plate=None,
            ocr_confidence=None,
            detection_confidence=None,
            candidates_considered=0,
        )

    debug = start_debug_frame(config.VISION_DEBUG_DIR)
    started = time.monotonic()
    if debug is not None:
        debug.frame(image)
    try:
        if config.VISION_FULL_FRAME_OCR:
            # The full-frame pass is the main reader; only the strongest boxes
            # are still OCR'd one by one, to keep each frame fast.
            candidates = candidates[: config.MAX_CANDIDATES_WITH_FULL_FRAME]
        result = _read_candidates(image, candidates, debug) if candidates else None
        if (result is None or result.status != DetectionStatus.DETECTED) and config.VISION_FULL_FRAME_OCR:
            full = _read_full_frame(image, debug, len(candidates))
            if full is not None:
                return full
        if result is not None:
            return result
        return VisionResult(
            status=DetectionStatus.NO_DETECTION,
            detected_plate=None,
            normalized_plate=None,
            ocr_confidence=None,
            detection_confidence=None,
            candidates_considered=0,
        )
    finally:
        if debug is not None:
            debug.note(f"processing took {(time.monotonic() - started) * 1000:.0f} ms")
            debug.save()


def _read_full_frame(image, debug: FrameDebug | None, considered: int) -> VisionResult | None:
    """Fallback: let EasyOCR find text anywhere in the frame and keep the first
    line that is a plate. Returns None when no line is."""
    min_confidence = config.VISION_MIN_OCR_CONFIDENCE
    # Full-frame OCR is the slow step on CPU (about 15 s per 1600 px frame);
    # a plate held up to the camera is still large after downscaling.
    lines = read_text_lines(enhance_for_ocr(resize_if_needed(image, config.FULL_FRAME_OCR_MAX_DIM)))
    if debug is not None:
        debug.note(f"full-frame OCR: {len(lines)} text line(s)")
    for line in lines:
        plate = match_plate(line.text)
        if debug is not None:
            debug.note(f"  line text='{line.text}' conf={line.confidence:.2f} -> {plate or 'not a plate'}")
        if plate is None or line.confidence < min_confidence:
            continue
        if debug is not None:
            debug.note(f"  -> plate {plate} (full frame)")
        return VisionResult(
            status=DetectionStatus.DETECTED,
            detected_plate=display_plate(plate),
            normalized_plate=plate,
            ocr_confidence=line.confidence,
            detection_confidence=None,
            candidates_considered=considered,
        )
    return None


def _read_candidates(image, candidates, debug: FrameDebug | None) -> VisionResult:
    # Deterministic multi-candidate policy: try strongest detection first,
    # stop at the first one OCR can actually read. Never blend/guess across
    # candidates and never fall through to a weaker match once a real read
    # succeeds.
    min_confidence = config.VISION_MIN_OCR_CONFIDENCE
    considered = 0
    padded_rereads = 0
    for candidate in candidates:
        considered += 1
        name = f"candidate{considered}"
        if debug is not None:
            debug.note(
                f"{name} box=({candidate.x},{candidate.y},{candidate.w},{candidate.h}) "
                f"det={candidate.detection_confidence:.2f}"
            )
        crop = candidate.crop(image)
        if crop.size == 0:
            continue
        enhanced = enhance_for_ocr(crop)
        ocr_result = read_plate_text(enhanced)
        if debug is not None:
            debug.crop(name, enhanced)
            debug.ocr("read", ocr_result)
        if ocr_result is None:
            continue
        normalized = normalize_plate(ocr_result.text)
        if len(normalized) < MIN_PLATE_TEXT_LENGTH:
            if debug is not None:
                debug.note("  -> rejected: no plate-number text")
            continue
        plate = match_plate(ocr_result.text)
        if plate is None and PLATE_PATTERN is not None and padded_rereads < MAX_PADDED_REREADS:
            # Text was found but not a whole plate: maybe only part of it was boxed.
            padded_rereads += 1
            wider_crop = enhance_for_ocr(_padded_crop(candidate, image))
            wider = read_plate_text(wider_crop)
            if debug is not None:
                debug.crop(f"{name}_padded", wider_crop)
                debug.ocr("padded re-read", wider)
            if wider is not None:
                plate = match_plate(wider.text)
                if plate is not None:
                    ocr_result = wider
        if plate is None:
            if debug is not None:
                debug.note("  -> rejected: not a plate format")
            continue
        if ocr_result.confidence < min_confidence:
            # Background text read as a plate shape is mostly low-confidence;
            # drop it here rather than report it.
            if debug is not None:
                debug.note(f"  -> rejected: {plate} conf {ocr_result.confidence:.2f} < {min_confidence:.2f}")
            continue
        if debug is not None:
            debug.note(f"  -> plate {plate}")
        if debug is not None:
            debug.note(f"  raw OCR text '{ocr_result.text}'")
        return VisionResult(
            status=DetectionStatus.DETECTED,
            # The corrected plate, not the raw OCR text: the API matches EXIT to
            # ENTRY on this value, so "A8C 123" must arrive as "ABC 123".
            detected_plate=display_plate(plate),
            normalized_plate=plate,
            ocr_confidence=ocr_result.confidence,
            detection_confidence=candidate.detection_confidence,
            candidates_considered=considered,
        )

    return VisionResult(
        status=DetectionStatus.OCR_FAILED,
        detected_plate=None,
        normalized_plate=None,
        ocr_confidence=None,
        detection_confidence=candidates[0].detection_confidence,
        candidates_considered=considered,
    )
