"""Full-frame OCR fallback and the corrected plate being reported (mocked OCR)."""

from unittest.mock import patch

import cv2
import numpy as np

from app.pipeline.detector import PlateCandidate
from app.pipeline.ocr import OcrFragment, OcrResult
from app.pipeline.service import DetectionStatus, process_image


def _png(value: int = 200) -> bytes:
    ok, buf = cv2.imencode(".png", np.full((120, 200, 3), value, dtype=np.uint8))
    return buf.tobytes()


def _line(text: str, conf: float = 0.9, height: float = 20.0) -> OcrResult:
    frag = OcrFragment(text=text, confidence=conf, x=0, top=0, bottom=height, kept=True)
    return OcrResult(text=text, confidence=conf, fragments=(frag,))


def test_full_frame_finds_plate_when_detector_boxes_only_clutter():
    clutter = PlateCandidate(x=0, y=0, w=20, h=10, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[clutter]),
        patch("app.pipeline.service.read_plate_text", return_value=None),
        patch("app.pipeline.service.read_text_lines", return_value=[_line("HELLO"), _line("ABC 1234")]),
    ):
        result = process_image(_png())
    assert result.status == DetectionStatus.DETECTED
    assert result.normalized_plate == "ABC1234"
    assert result.detection_confidence is None


def test_full_frame_runs_even_when_detector_finds_nothing():
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[]),
        patch("app.pipeline.service.read_text_lines", return_value=[_line("XYZ 789")]),
    ):
        result = process_image(_png())
    assert result.status == DetectionStatus.DETECTED
    assert result.normalized_plate == "XYZ789"


def test_full_frame_without_a_plate_keeps_no_detection():
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[]),
        patch("app.pipeline.service.read_text_lines", return_value=[_line("EXIT ONLY")]),
    ):
        result = process_image(_png())
    assert result.status == DetectionStatus.NO_DETECTION
    assert result.detected_plate is None


def test_full_frame_respects_the_confidence_floor():
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[]),
        patch("app.pipeline.service.read_text_lines", return_value=[_line("ABC 1234", conf=0.1)]),
    ):
        result = process_image(_png())
    assert result.status != DetectionStatus.DETECTED


def test_full_frame_can_be_turned_off():
    with (
        patch("app.config.VISION_FULL_FRAME_OCR", False),
        patch("app.pipeline.service.detect_plate_candidates", return_value=[]),
        patch("app.pipeline.service.read_text_lines") as full,
    ):
        result = process_image(_png())
    full.assert_not_called()
    assert result.status == DetectionStatus.NO_DETECTION


def test_reported_plate_is_the_corrected_plate_not_raw_ocr_text():
    # EXIT is matched to ENTRY on this value, so "A8C 123" must arrive as "ABC 123".
    box = PlateCandidate(x=0, y=0, w=100, h=30, detection_confidence=0.8)
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[box]),
        patch("app.pipeline.service.read_plate_text", return_value=_line("A8C 123")),
    ):
        result = process_image(_png())
    assert result.status == DetectionStatus.DETECTED
    assert result.detected_plate == "ABC 123"
    assert result.normalized_plate == "ABC123"


def test_full_frame_plate_is_reported_with_a_space():
    with (
        patch("app.pipeline.service.detect_plate_candidates", return_value=[]),
        patch("app.pipeline.service.read_text_lines", return_value=[_line("DAB1245")]),
    ):
        result = process_image(_png())
    assert result.detected_plate == "DAB 1245"
    assert result.normalized_plate == "DAB1245"
