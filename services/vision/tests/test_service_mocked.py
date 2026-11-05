"""Mocked failure-path tests: model/detector/OCR failure, malformed input.
Real inference is covered separately in test_real_inference_smoke.py.
"""

from unittest.mock import patch

import numpy as np
import pytest

from app.pipeline.detector import PlateCandidate
from app.pipeline.ocr import OcrResult
from app.pipeline.service import DetectionStatus, process_image


def test_process_image_raises_on_corrupt_bytes():
    with pytest.raises(ValueError):
        process_image(b"not an image")


def test_no_candidates_short_circuits_before_ocr():
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[]) as mock_detect,
        patch("app.pipeline.service.read_plate_text") as mock_ocr,
    ):
        import cv2

        blank = np.zeros((10, 10, 3), dtype=np.uint8)
        ok, buf = cv2.imencode(".png", blank)
        result = process_image(buf.tobytes())

    mock_detect.assert_called_once()
    mock_ocr.assert_not_called()
    assert result.status == DetectionStatus.NO_DETECTION


def test_ocr_failure_on_every_candidate_yields_ocr_failed_status():
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=None),
    ):
        import cv2

        blank = np.full((20, 20, 3), 200, dtype=np.uint8)
        ok, buf = cv2.imencode(".png", blank)
        result = process_image(buf.tobytes())

    assert result.status == DetectionStatus.OCR_FAILED
    assert result.detected_plate is None
    assert result.candidates_considered == 1


def _blank_png():
    import cv2

    ok, buf = cv2.imencode(".png", np.full((20, 20, 3), 200, dtype=np.uint8))
    return buf.tobytes()


def test_low_confidence_plate_reading_is_rejected(monkeypatch):
    monkeypatch.setattr("app.config.VISION_MIN_OCR_CONFIDENCE", 0.4)
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="ABC 1234", confidence=0.39)),
    ):
        result = process_image(_blank_png())
    assert result.status == DetectionStatus.OCR_FAILED
    assert result.normalized_plate is None


def test_reading_at_the_confidence_threshold_is_kept(monkeypatch):
    monkeypatch.setattr("app.config.VISION_MIN_OCR_CONFIDENCE", 0.4)
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="ABC 1234", confidence=0.4)),
    ):
        result = process_image(_blank_png())
    assert result.status == DetectionStatus.DETECTED
    assert result.normalized_plate == "ABC1234"
    assert result.ocr_confidence == 0.4


def test_low_confidence_candidate_falls_through_to_the_next_one(monkeypatch):
    monkeypatch.setattr("app.config.VISION_MIN_OCR_CONFIDENCE", 0.4)
    first = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.9)
    second = PlateCandidate(x=5, y=5, w=10, h=5, detection_confidence=0.7)
    reads = [OcrResult(text="LMA 777", confidence=0.2), OcrResult(text="XYZ 567", confidence=0.8)]
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[first, second]),
        patch("app.pipeline.service.read_plate_text", side_effect=reads),
    ):
        result = process_image(_blank_png())
    assert result.normalized_plate == "XYZ567"
    assert result.candidates_considered == 2


def test_debug_dir_saves_crops_and_ocr_text(monkeypatch, tmp_path):
    monkeypatch.setattr("app.config.VISION_DEBUG_DIR", str(tmp_path))
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="ABC 1234", confidence=0.9)),
    ):
        result = process_image(_blank_png())
    assert result.normalized_plate == "ABC1234"
    (frame_dir,) = list(tmp_path.iterdir())
    assert (frame_dir / "candidate1.png").is_file()
    text = (frame_dir / "ocr.txt").read_text(encoding="utf-8")
    assert "text='ABC 1234' conf=0.90" in text
    assert "-> plate ABC1234" in text


def test_debug_dir_records_rejected_readings(monkeypatch, tmp_path):
    monkeypatch.setattr("app.config.VISION_DEBUG_DIR", str(tmp_path))
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="EXIT ONLY", confidence=0.9)),
    ):
        result = process_image(_blank_png())
    assert result.status == DetectionStatus.OCR_FAILED
    (frame_dir,) = list(tmp_path.iterdir())
    text = (frame_dir / "ocr.txt").read_text(encoding="utf-8")
    assert "rejected: not a plate format" in text
    # The padded re-read crop is saved too.
    assert (frame_dir / "candidate1_padded.png").is_file()


def test_debug_dir_unset_writes_nothing(monkeypatch, tmp_path):
    monkeypatch.setattr("app.config.VISION_DEBUG_DIR", "")
    monkeypatch.chdir(tmp_path)
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="ABC 1234", confidence=0.9)),
    ):
        process_image(_blank_png())
    assert list(tmp_path.iterdir()) == []


def test_unwritable_debug_dir_does_not_break_detection(monkeypatch, tmp_path):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x")
    monkeypatch.setattr("app.config.VISION_DEBUG_DIR", str(blocker))
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="ABC 1234", confidence=0.9)),
    ):
        result = process_image(_blank_png())
    assert result.normalized_plate == "ABC1234"


def test_never_falls_back_to_a_guessed_plate_when_ocr_text_too_short():
    candidate = PlateCandidate(x=0, y=0, w=10, h=5, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[candidate]),
        patch("app.pipeline.service.read_plate_text", return_value=OcrResult(text="?", confidence=0.9)),
    ):
        import cv2

        blank = np.full((20, 20, 3), 200, dtype=np.uint8)
        ok, buf = cv2.imencode(".png", blank)
        result = process_image(buf.tobytes())

    assert result.status == DetectionStatus.OCR_FAILED
    assert result.detected_plate is None
