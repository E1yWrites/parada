"""Orchestrates: decode -> preprocess -> detect -> crop -> OCR -> normalize.

No business logic lives here (no guest policy, no fee, no violation, no
occupancy/session decisions) — this module only answers "what does the
camera image show", matching the architecture boundary in
docs/vision/architecture.md and services/api's OccupancyService, which
remains the sole place that interprets a plate into parking state.
"""

from dataclasses import dataclass
from enum import Enum

from .detector import detect_plate_candidates
from .normalize import normalize_plate
from .ocr import read_plate_text
from .preprocessing import decode_image, enhance_for_ocr, resize_if_needed

MIN_PLATE_TEXT_LENGTH = 2  # shorter than this is noise, not a plate reading


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
    for candidate in candidates:
        considered += 1
        crop = candidate.crop(image)
        if crop.size == 0:
            continue
        enhanced = enhance_for_ocr(crop)
        ocr_result = read_plate_text(enhanced)
        if ocr_result is None:
            continue
        normalized = normalize_plate(ocr_result.text)
        if len(normalized) < MIN_PLATE_TEXT_LENGTH:
            continue
        return VisionResult(
            status=DetectionStatus.DETECTED,
            detected_plate=ocr_result.text,
            normalized_plate=normalized,
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
