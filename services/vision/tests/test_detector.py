import os

import cv2

from app.pipeline.detector import (
    MAX_ASPECT_RATIO,
    MIN_ASPECT_RATIO,
    detect_plate_candidates,
)

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "images")


def _load(name: str):
    return cv2.imread(os.path.join(FIXTURES, name))


def test_finds_candidate_on_clear_plate():
    candidates = detect_plate_candidates(_load("clear_plate.png"))
    assert len(candidates) >= 1
    top = candidates[0]
    aspect_ratio = top.w / top.h
    assert MIN_ASPECT_RATIO <= aspect_ratio <= MAX_ASPECT_RATIO
    assert 0.0 <= top.detection_confidence <= 1.0


def test_no_candidates_on_plateless_scene():
    candidates = detect_plate_candidates(_load("no_plate.png"))
    assert candidates == []


def test_candidates_sorted_by_confidence_descending():
    candidates = detect_plate_candidates(_load("multiple_plates.png"))
    confidences = [c.detection_confidence for c in candidates]
    assert confidences == sorted(confidences, reverse=True)
