"""Orchestrates: decode -> preprocess -> detect -> crop -> OCR -> normalize.

No business logic lives here (no guest policy, no fee, no violation, no
occupancy/session decisions) — this module only answers "what does the
camera image show", matching the architecture boundary in
docs/vision/architecture.md and services/api's OccupancyService, which
remains the sole place that interprets a plate into parking state.
"""

import os
import re
from dataclasses import dataclass
from enum import Enum

from .detector import detect_plate_candidates
from .normalize import normalize_plate
from .ocr import read_plate_text
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


def match_plate(normalized: str) -> str | None:
    """Return the plate found in a normalized reading, or None.

    Tries, in order: the whole reading; any 7- then 6-character window of it
    (drops stray characters picked up next to the plate, e.g. "IABC1234");
    and, for the default PH format, the same windows with letter/digit
    confusions corrected by position ("ABCI234" -> "ABC1234").
    """
    if PLATE_PATTERN is None:
        return normalized if len(normalized) >= MIN_PLATE_TEXT_LENGTH else None
    if PLATE_PATTERN.match(normalized):
        return normalized
    correct = _PLATE_PATTERN_SOURCE == DEFAULT_PLATE_PATTERN
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
    if not candidates:
        return VisionResult(
            status=DetectionStatus.NO_DETECTION,
            detected_plate=None,
            normalized_plate=None,
            ocr_confidence=None,
            detection_confidence=None,
            candidates_considered=0,
        )

    # Deterministic multi-candidate policy: try strongest detection first,
    # stop at the first one OCR can actually read. Never blend/guess across
    # candidates and never fall through to a weaker match once a real read
    # succeeds.
    considered = 0
    padded_rereads = 0
    for candidate in candidates:
        considered += 1
        crop = candidate.crop(image)
        if crop.size == 0:
            continue
        ocr_result = read_plate_text(enhance_for_ocr(crop))
        if ocr_result is None:
            continue
        normalized = normalize_plate(ocr_result.text)
        if len(normalized) < MIN_PLATE_TEXT_LENGTH:
            continue
        plate = match_plate(normalized)
        if plate is None and PLATE_PATTERN is not None and padded_rereads < MAX_PADDED_REREADS:
            # Text was found but not a whole plate: maybe only part of it was boxed.
            padded_rereads += 1
            wider = read_plate_text(enhance_for_ocr(_padded_crop(candidate, image)))
            if wider is not None:
                plate = match_plate(normalize_plate(wider.text))
                if plate is not None:
                    ocr_result = wider
        if plate is None:
            continue
        return VisionResult(
            status=DetectionStatus.DETECTED,
            detected_plate=ocr_result.text,
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
