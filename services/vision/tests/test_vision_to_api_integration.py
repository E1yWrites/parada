"""Vision -> existing PARADA API handoff (section 63/71).

This proves the real integration boundary: Vision produces a normalized
event from a real image and POSTs it to services/api's existing
POST /zones/:zoneId/events (never touching Prisma/PostgreSQL directly).

Spinning up the full Node API + Postgres stack on every test run is
expensive, so this test is opt-in: set PARADA_TEST_API_URL,
PARADA_TEST_CAMERA_API_KEY, PARADA_TEST_ZONE_ID and
PARADA_TEST_CAMERA_IDENTIFIER (an existing camera on that zone) to run it
against a live dev instance (see services/api README for how to run one and
services/vision/README.md for the exact fixture setup). It is skipped by
default rather than removed, so the integration path stays proven when a
real stack is available without forcing one on every CI run.
"""

import os

import pytest

from app.api_client import forward_event
from app.pipeline.service import DetectionStatus, process_image

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "images")

API_URL = os.environ.get("PARADA_TEST_API_URL")
CAMERA_API_KEY = os.environ.get("PARADA_TEST_CAMERA_API_KEY")
ZONE_ID = os.environ.get("PARADA_TEST_ZONE_ID")
CAMERA_IDENTIFIER = os.environ.get("PARADA_TEST_CAMERA_IDENTIFIER")

pytestmark = pytest.mark.skipif(
    not all([API_URL, ZONE_ID, CAMERA_IDENTIFIER]),
    reason=(
        "requires a live services/api instance — set PARADA_TEST_API_URL, "
        "PARADA_TEST_ZONE_ID, PARADA_TEST_CAMERA_IDENTIFIER "
        "(and PARADA_TEST_CAMERA_API_KEY if the API enforces one)"
    ),
)


def test_real_detection_forwards_into_existing_api_pipeline(monkeypatch):
    monkeypatch.setattr("app.config.PARADA_API_URL", API_URL)
    monkeypatch.setattr("app.config.CAMERA_API_KEY", CAMERA_API_KEY)

    with open(os.path.join(FIXTURES, "clear_plate.png"), "rb") as f:
        image_bytes = f.read()

    result = process_image(image_bytes)
    assert result.status == DetectionStatus.DETECTED

    event = {
        "cameraIdentifier": CAMERA_IDENTIFIER,
        "sourceEventId": f"integration-test-{result.normalized_plate}",
        "eventType": "ENTRY",
        "detectedPlate": result.detected_plate,
        "ocrConfidence": result.ocr_confidence,
    }
    status_code, body = forward_event(ZONE_ID, event)

    # The API remains authoritative: it may accept (201) or reject for
    # domain reasons (e.g. 409 zone full) — either way it must be a clean
    # domain response, never a transport-level failure, proving the handoff
    # actually reached OccupancyService.
    assert status_code in (201, 409)
    assert isinstance(body, dict)


FIXTURE_VIDEO = os.path.join(os.path.dirname(__file__), "fixtures", "videos", "clear_plate.mp4")


def test_full_pipeline_source_to_api_via_real_ocr(monkeypatch):
    """Section 54: SOURCE -> VISION -> API -> CAMERA VALIDATION -> OCCUPANCY -> DB.

    Drives the real phase-11C runtime (a FileCameraSource over a real Mp4
    fixture) through the real EasyOCR pipeline and POSTs the normalized event
    to the existing API. The runtime never touches Postgres; the API resolves
    the camera-to-zone binding from CAMERA_IDENTIFIER.
    """
    if not os.path.isfile(FIXTURE_VIDEO):
        pytest.skip("fixture video missing — run tests/fixtures/generate_video.py")
    real_forward = __import__("app.api_client", fromlist=["forward_event"]).forward_event

    def recording_forward(zone_id, event):
        status, body = real_forward(zone_id, event)
        recording_forward.calls.append((zone_id, event, status))
        return status, body

    recording_forward.calls = []
    recording_forward.sentinel = True

    from app.camera.sources import FileCameraSource
    from app.camera.runtime import CameraRuntime

    source = FileCameraSource(FIXTURE_VIDEO)
    runtime = CameraRuntime(
        source=source,
        camera_identifier=CAMERA_IDENTIFIER,
        zone_id=ZONE_ID,
        process_fps=1.0,
        cooldown_seconds=0.0,
        reconnect_delay=0.0,
        max_consecutive_failures=3,
    )
    monkeypatch.setattr("app.config.PARADA_API_URL", API_URL)
    monkeypatch.setattr("app.config.CAMERA_API_KEY", CAMERA_API_KEY)
    monkeypatch.setattr("app.camera.runtime.api_client.forward_event", recording_forward)

    runtime.run()

    assert runtime.stats.frames_read > 0
    # The clip alternates clear/no-plate frames and debounce is off; at least
    # one ENTRY event must have been produced from a real OCR read...
    assert runtime.stats.detections >= 1
    assert recording_forward.calls, "no event reached the API"

    # ...and every event that reached the API was answered by the authoritative
    # OccupancyService pipeline (accepted or a deliberate domain rejection),
    # never a transport failure or an opinion invented in Python.
    for _zone, _event, status in recording_forward.calls:
        assert status in (201, 409)
