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
