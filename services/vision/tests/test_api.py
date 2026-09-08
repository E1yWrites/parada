import os

from fastapi.testclient import TestClient

from app.main import app

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "images")


def _image_bytes(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


def test_health_reports_model_loaded():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["modelLoaded"] is True


def test_detect_happy_path_returns_normalized_event():
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("clear_plate.png", _image_bytes("clear_plate.png"), "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DETECTED"
    assert body["normalizedPlate"] == "ABC1234"
    assert body["cameraIdentifier"] == "CAM-1"
    assert body["eventType"] == "ENTRY"
    assert body["sourceEventId"].startswith("vision-")
    assert 0.0 <= body["ocrConfidence"] <= 1.0


def test_detect_source_event_id_is_deterministic_for_same_frame_and_camera():
    with TestClient(app) as client:
        image = _image_bytes("clear_plate.png")
        r1 = client.post(
            "/detect",
            files={"image": ("clear_plate.png", image, "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY"},
        )
        r2 = client.post(
            "/detect",
            files={"image": ("clear_plate.png", image, "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY"},
        )
    assert r1.json()["sourceEventId"] == r2.json()["sourceEventId"]


def test_detect_rejects_missing_camera_identifier():
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("clear_plate.png", _image_bytes("clear_plate.png"), "image/png")},
            data={"eventType": "ENTRY"},
        )
    assert response.status_code == 422  # FastAPI required-field validation


def test_detect_rejects_invalid_event_type():
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("clear_plate.png", _image_bytes("clear_plate.png"), "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "SOMETHING"},
        )
    assert response.status_code == 400


def test_detect_rejects_malformed_detected_at():
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("clear_plate.png", _image_bytes("clear_plate.png"), "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY", "detectedAt": "not-a-date"},
        )
    assert response.status_code == 400


def test_detect_rejects_corrupt_image():
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("bad.png", b"not an image", "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY"},
        )
    assert response.status_code == 400


def test_detect_rejects_oversized_image():
    oversized = b"\x00" * (9 * 1024 * 1024)
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("huge.png", oversized, "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY"},
        )
    assert response.status_code == 413


def test_detect_forward_requires_zone_id():
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("clear_plate.png", _image_bytes("clear_plate.png"), "image/png")},
            data={"cameraIdentifier": "CAM-1", "eventType": "ENTRY", "forward": "true"},
        )
    assert response.status_code == 400


def test_detect_forward_handles_unreachable_api_cleanly():
    # No live API in this test process — proves a downstream network failure
    # while forwarding is reported cleanly (never a 500/stack trace).
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"image": ("clear_plate.png", _image_bytes("clear_plate.png"), "image/png")},
            data={
                "cameraIdentifier": "CAM-1",
                "eventType": "ENTRY",
                "forward": "true",
                "zoneId": "zone-1",
            },
        )
    assert response.status_code == 200
    forward_result = response.json()["forwardResult"]
    assert forward_result["forwarded"] is False
    assert forward_result["error"]
