"""REAL INFERENCE SMOKE TEST.

Loads the actual EasyOCR model and runs it against real fixture images —
nothing here is mocked. This is the test that proves the production
inference path (classical CV detector + real EasyOCR recognizer) genuinely
executes, per Phase 11 requirement #45/#70.

Downloads the model on first run (~94MB, cached under ~/.EasyOCR) — slower
than the rest of the suite, that's expected for a real model.
"""

import os

from app.pipeline.service import DetectionStatus, process_image

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "images")


def _read(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


def test_real_model_reads_clear_plate():
    result = process_image(_read("clear_plate.png"))
    assert result.status == DetectionStatus.DETECTED
    assert result.normalized_plate == "ABC1234"
    # real confidence from the recognition network — bounded, not exact-matched
    assert 0.5 <= result.ocr_confidence <= 1.0
    assert 0.0 <= result.detection_confidence <= 1.0


def test_real_model_normalizes_spaced_hyphenated_text():
    result = process_image(_read("spaced_plate.png"))
    assert result.status == DetectionStatus.DETECTED
    assert result.normalized_plate == "ABC1234"


def test_real_model_reports_low_confidence_on_degraded_plate():
    result = process_image(_read("angled_plate.png"))
    assert result.status == DetectionStatus.DETECTED
    # angled text is harder to read than the clear fixture; the real model
    # should score it lower, proving confidence isn't a fixed/fabricated value
    clear = process_image(_read("clear_plate.png"))
    assert result.ocr_confidence < clear.ocr_confidence


def test_real_model_reports_no_detection_without_fabricating_a_plate():
    result = process_image(_read("no_plate.png"))
    assert result.status == DetectionStatus.NO_DETECTION
    assert result.detected_plate is None
    assert result.normalized_plate is None


def test_real_model_never_fabricates_a_plate_on_unreadable_input():
    result = process_image(_read("unreadable_plate.png"))
    # Either no plate-shaped region was found, or OCR could not read reliable
    # text — either way it must never invent "ABC1234" or any other plate.
    assert result.status in (DetectionStatus.NO_DETECTION, DetectionStatus.OCR_FAILED)
    assert result.detected_plate is None


def test_real_model_multiple_candidates_is_deterministic():
    first = process_image(_read("multiple_plates.png"))
    second = process_image(_read("multiple_plates.png"))
    assert first.normalized_plate == second.normalized_plate
    assert first.status == DetectionStatus.DETECTED
    assert first.candidates_considered == second.candidates_considered
    # a real reading of one of the two plate regions, never empty/fabricated
    assert first.normalized_plate
