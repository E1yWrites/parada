"""CLI + file-source end-to-end tests for the camera runtime (Phase 11C).

These exercise the exact development flow without hardware: a real Mp4
fixture -> real CameraRuntime -> shared OCR pipeline -> (mocked) API handoff.
"""

import os
from unittest.mock import patch

import pytest

from app.camera.cli import main
from app.camera.runtime import CameraRuntime
from app.camera.sources import FileCameraSource

FIXTURE_VIDEO = os.path.join(os.path.dirname(__file__), "fixtures", "videos", "clear_plate.mp4")


@pytest.fixture(scope="module")
def fixture_video():
    if not os.path.isfile(FIXTURE_VIDEO):
        pytest.skip("fixture video missing — run tests/fixtures/generate_video.py")
    return FIXTURE_VIDEO


def test_cli_test_mode_reports_health_for_file_source(fixture_video, monkeypatch, capsys):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "file")
    monkeypatch.setattr("app.config.CAMERA_FILE_PATH", fixture_video)
    monkeypatch.setattr("app.config.CAMERA_IDENTIFIER", "CAM-A01")

    code = main(["test"])
    out = capsys.readouterr().out
    assert code == 0
    assert "CAM-A01" in out
    assert "source" in out
    assert "connected" in out
    assert "resolution" in out
    assert "plate read" in out


def test_cli_run_mode_stops_cleanly_at_video_eof(fixture_video, monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "file")
    monkeypatch.setattr("app.config.CAMERA_FILE_PATH", fixture_video)
    monkeypatch.setattr("app.config.CAMERA_IDENTIFIER", "CAM-A01")
    # Disable reconnects so EOF exits cleanly fast.
    monkeypatch.setattr("app.config.MAX_CAMERA_RECONNECTS", "0")

    with patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}})) as fwd:
        code = main(["run"])
        assert code == 0
        assert fwd.call_count >= 1


def test_file_source_runtime_reads_and_OCR_processes_real_frames(fixture_video):
    runtime = CameraRuntime(
        source=FileCameraSource(fixture_video),
        camera_identifier="CAM-A01",
        zone_id="zone-1",
        process_fps=2.0,
        cooldown_seconds=0.0,
        reconnect_delay=0.0,
        max_consecutive_failures=3,
    )
    with patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}})) as fwd:
        runtime.run()

    assert runtime.stats.frames_read >= 1
    assert runtime.stats.frames_processed >= 1
    # The clip alternates a clear plate and a no-plate frame, so the OCR
    # pipeline must have detected a plate at least once from a real frame.
    assert runtime.stats.detections >= 1
    assert fwd.call_count >= 1
    event = fwd.call_args_list[0][0][1]
    assert event["cameraIdentifier"] == "CAM-A01"
    assert event["eventType"] == "ENTRY"
    assert event["detectedPlate"] == "ABC1234"


def test_runtime_forwards_events_via_existing_api_contract(fixture_video):
    runtime = CameraRuntime(
        source=FileCameraSource(fixture_video),
        camera_identifier="CAM-A01",
        zone_id="zone-1",
        process_fps=2.0,
        cooldown_seconds=0.0,
        reconnect_delay=0.0,
        max_consecutive_failures=3,
    )
    seen = []

    def fake_forward(zone_id, event):
        seen.append((zone_id, dict(event)))
        return 201, {"data": {"ok": True}}

    with patch("app.camera.runtime.api_client.forward_event", side_effect=fake_forward):
        runtime.run()

    zone_id, event = seen[0]
    # Contract matches POST /zones/:zoneId/events exactly.
    assert zone_id == "zone-1"
    assert set(event) >= {"cameraIdentifier", "sourceEventId", "eventType", "detectedPlate", "ocrConfidence", "detectedAt"}
    assert event["sourceEventId"].startswith("vision-edge-")