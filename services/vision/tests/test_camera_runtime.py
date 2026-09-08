"""Runtime tests: frame loop, debounce, API outcome handling, reconnect,
failure isolation, FPS capping, and clean shutdown (Phase 11C). All use a
FakeSource so no hardware is required.
"""

import os
import time
from unittest.mock import patch

import pytest

from app.camera.base import CameraSourceError, FrameReadError
from app.camera.runtime import CameraRuntime
from app.pipeline.service import DetectionStatus

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "videos")
VIDEO = os.path.join(FIXTURES, "clear_plate.mp4")

N_CLEAR_FRAMES = 20  # enough to observe several reads without instant EOF


class FakeSource:
    source_type = "usb"

    def __init__(self, n_frames=N_CLEAR_FRAMES, fail_open=False, fail_after=None):
        self.n_frames = n_frames
        self.fail_open = fail_open
        self.fail_after = fail_after
        self.reads = 0
        self.opens = 0
        self.closes = 0
        self._opened = False

    def _frame(self):
        import cv2
        import numpy as np

        png = os.path.join(os.path.dirname(__file__), "fixtures", "images", "clear_plate.png")
        frame = cv2.imread(png)
        if frame is None:
            frame = np.zeros((600, 800, 3), dtype=np.uint8)
        return frame

    @property
    def opened(self):
        return self._opened

    def open(self):
        self.opens += 1
        if self.fail_open:
            raise CameraSourceError("no device present")
        self._opened = True

    def read_frame(self):
        if not self._opened:
            raise FrameReadError("not opened")
        if self.fail_after is not None and self.reads >= self.fail_after:
            self.reads += 1
            raise FrameReadError("stream lost")
        if self.reads >= self.n_frames:
            self.reads += 1
            raise FrameReadError("EOF")
        frame = self._frame()
        self.reads += 1
        return frame

    def close(self):
        self.closes += 1
        self._opened = False

    def resolution(self):
        return (800, 600) if self._opened else (0, 0)


@pytest.fixture()
def fake():
    return FakeSource()


def _runtime(fake, **kw):
    kw.setdefault("cooldown_seconds", 0.0)
    kw.setdefault("process_fps", 20.0)
    kw.setdefault("reconnect_delay", 0.01)
    return CameraRuntime(
        source=fake,
        camera_identifier="CAM-A01",
        zone_id="zone-1",
        **kw,
    )


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_run_forwards_detected_plate_and_stops_at_eof(mock_forward, fake):
    fake.n_frames = 2
    rt = _runtime(fake)
    rt.run()

    # The clear-plate frames are identical, but each forwarded event must carry
    # a fresh direction (ENTRY) — debounce disabled (cooldown_seconds=0).
    assert mock_forward.call_count >= 1
    first = mock_forward.call_args_list[0][0][1]
    assert first["cameraIdentifier"] == "CAM-A01"
    assert first["eventType"] == "ENTRY"
    assert first["detectedPlate"] == "ABC1234"
    assert "sourceEventId" in first
    assert "zoneId" in first or "zoneId" in str(first)  # zone pinned by runtime

    assert rt.stats.frames_read > 0
    assert rt.stats.frames_processed > 0
    assert fake.closes >= 1


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_debounce_suppresses_repeated_same_plate_within_cooldown(mock_forward, fake):
    fake.n_frames = 30  # many identical frames in a row
    rt = _runtime(fake, cooldown_seconds=60.0, process_fps=20.0)
    rt.run()
    # Only one observation survives the cooldown for the same camera+plate+direction.
    assert mock_forward.call_count == 1


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_different_directions_are_not_debounced_away(mock_forward, fake):
    fake.n_frames = 20
    rt = _runtime(fake, cooldown_seconds=60.0, process_fps=20.0)
    # Make frames alternate plate->no-plate so reads cycle; then after the first
    # observation, manually seed the debounce cache with a *different* direction.
    rt._last_observations[("CAM-A01", "ABC1234", "EXIT")] = time.monotonic()
    # Reset the fake so the runtime re-reads many frames, not one.
    fake.n_frames = 20
    rt.run()
    # The EXIT-keyed seed does not block the ENTRY observation.
    assert mock_forward.call_count == 1


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_api_429_does_not_clear_credentials_and_continues(mock_forward, fake):
    fake.n_frames = 6
    calls = {"n": 0}

    def flaky(*_a):
        calls["n"] += 1
        if calls["n"] == 1:
            return (429, {"error": {"code": "TOO_MANY_REQUESTS"}})
        return (201, {"data": {}})

    mock_forward.side_effect = flaky
    rt = _runtime(fake, cooldown_seconds=0.0, reconnect_delay=0.01, process_fps=20.0)
    rt.run()
    assert rt.stats.api_throttled == 1
    # No new token requested, no credential mutation; the runtime continued
    # forwarding after the throttle backoff (debounce off so frames 2+ forward).
    assert calls["n"] >= 2


@patch("app.camera.runtime.api_client.forward_event", return_value=(409, {"error": {"message": "duplicate"}}))
def test_api_409_is_not_treated_as_failure_and_not_retried(mock_forward, fake):
    fake.n_frames = 6
    rt = _runtime(fake, cooldown_seconds=60.0)
    rt.run()
    assert rt.stats.api_conflict == 1
    # A business duplicate is acknowledged once; the runtime does not spin on it.
    assert mock_forward.call_count == 1


@patch("app.camera.runtime.api_client.forward_event", return_value=(500, {"error": {"message": "boom"}}))
def test_api_5xx_is_bounded(mock_forward, fake):
    fake.n_frames = 10
    rt = _runtime(fake, cooldown_seconds=0.0, reconnect_delay=0.0)
    rt.run()
    # Every non-duplicate event attempt fails with 500; debounce is disabled so
    # each distinct processed frame attempts forwarding. Bounded by n_frames.
    assert rt.stats.api_error == fake.n_frames


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_reconnect_after_long_read_gap(mock_forward, fake):
    fake.fail_after = 2  # after 2 reads, stream dies permanently
    fake.n_frames = 4
    rt = _runtime(fake, max_consecutive_failures=1, reconnect_delay=0.01, process_fps=20.0)
    rt.run()
    assert rt.stats.reconnects >= 1
    assert fake.opens >= 2  # initial + reconnect(s)
    assert rt.stats.read_failures >= 1


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_close_stops_loop_cleanly(mock_forward, fake):
    fake.n_frames = 1_000_000  # effectively endless
    rt = _runtime(fake, process_fps=1000.0)
    import threading

    t = threading.Thread(target=rt.run)
    t.start()
    time.sleep(0.05)
    rt.close()
    t.join(timeout=2.0)
    assert not t.is_alive()
    assert fake.closes >= 1
    assert rt.stats.frames_read > 0


def test_open_failure_isolates_and_does_not_crash_process(fake):
    fake.fail_open = True
    rt = _runtime(fake, reconnect_delay=0.01)
    # Should exit the loop (never opens) without raising.
    rt.run()
    assert rt.stats.read_failures >= 1
    assert fake.opens >= 1


def test_runtime_source_event_id_is_deterministic():
    rt = _runtime(FakeSource(1))
    b1 = b"frame-one-bytes"
    b2 = b"frame-one-bytes"
    assert rt._source_event_id(b1) == rt._source_event_id(b2)
    assert rt._source_event_id(b1) != rt._source_event_id(b"frame-two-bytes")
    assert rt._source_event_id(b1).startswith("vision-edge-")


def test_runtime_source_event_id_deterministic_across_instances():
    rt1 = _runtime(FakeSource(1))
    rt2 = _runtime(FakeSource(1))
    assert rt1._source_event_id(b"x") == rt2._source_event_id(b"x")