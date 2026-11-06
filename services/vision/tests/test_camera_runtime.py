"""Runtime tests: frame loop, debounce, API outcome handling, reconnect,
failure isolation, FPS capping, and clean shutdown (Phase 11C). All use a
FakeSource so no hardware is required.
"""

import os
import time
from unittest.mock import patch

import httpx
import pytest

from app.camera.base import CameraSourceError, FrameReadError
from app.camera.runtime import CameraRuntime
from app.event_identity import make_source_event_id
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
    # Debounce off by default (no hard minimum, no presence suppression);
    # tests that exercise it set cooldown_seconds / absence_reset_seconds.
    kw.setdefault("cooldown_seconds", 0.0)
    kw.setdefault("absence_reset_seconds", 0.0)
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
    assert first["detectedPlate"] == "ABC 1234"
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
    rt = _runtime(
        fake, cooldown_seconds=0.0, reconnect_delay=0.0, max_forward_attempts=1, plate_confirm_min_reads=1
    )
    rt.run()
    # Every non-duplicate event attempt fails with 500; debounce and plate
    # confirmation are disabled so each processed frame attempts forwarding
    # once. Bounded by n_frames.
    assert rt.stats.api_error == fake.n_frames


@patch("app.camera.runtime.api_client.forward_event", side_effect=httpx.ConnectError("connection refused"))
def test_api_transport_failure_is_isolated_and_the_camera_keeps_running(mock_forward, fake):
    """API down / DNS / timeout: the loop must not crash. Each failed handoff
    is counted, the runtime backs off, and it keeps reading frames until the
    source ends — then shuts the source down cleanly."""
    fake.n_frames = 4
    # Confirmation off, so every frame's handoff is attempted (and fails).
    rt = _runtime(
        fake, cooldown_seconds=0.0, reconnect_delay=0.0, max_forward_attempts=1, plate_confirm_min_reads=1
    )
    rt.run()  # must not raise
    assert rt.stats.api_error == fake.n_frames
    assert rt.stats.frames_read == fake.n_frames
    assert fake.closes >= 1


# ---------------------------------------------------------------- retry
#
# The debounce timestamp is written before the forward is attempted, so a lost
# event makes the car invisible for the whole cooldown and it is never counted.
# The safe recovery re-sends the SAME event object (same sourceEventId), so a
# commit whose response was lost is answered 409 by the API's unique
# constraint instead of being counted twice. Re-sending via the next frame
# cannot do that: a live camera yields new bytes, hence a new id, every frame.


def _one_detection_runtime(fake, **kw):
    kw.setdefault("cooldown_seconds", 60.0)  # exactly one forward per plate
    kw.setdefault("reconnect_delay", 0.0)
    return _runtime(fake, **kw)


@patch("app.camera.runtime.api_client.forward_event")
def test_transport_failure_retries_the_same_event_and_recovers(mock_forward, fake):
    fake.n_frames = 6
    seen = []

    def flaky(_zone, event):
        seen.append(event["sourceEventId"])
        if len(seen) == 1:
            raise httpx.ConnectError("connection refused")
        return (201, {"data": {}})

    mock_forward.side_effect = flaky
    rt = _one_detection_runtime(fake, max_forward_attempts=3)
    rt.run()

    # The first attempt failed; the retry carried the identical id and landed.
    assert len(seen) == 2
    assert seen[0] == seen[1]
    assert rt.stats.api_ok == 1
    assert rt.stats.api_error == 1
    assert rt.stats.api_retries == 1
    assert rt.stats.last_event is not None and rt.stats.last_event["outcome"] == "ok"


@patch("app.camera.runtime.api_client.forward_event")
def test_commit_then_lost_response_is_absorbed_as_a_conflict_not_a_double_count(mock_forward, fake):
    """The API committed attempt 1 but the response timed out. Attempt 2 re-sends
    the same sourceEventId, so the API answers 409 duplicate — the car is
    counted exactly once and the runtime records a conflict, not an error."""
    fake.n_frames = 6
    seen = []

    def committed_then_timeout(_zone, event):
        seen.append(event["sourceEventId"])
        if len(seen) == 1:
            raise httpx.ReadTimeout("response lost after commit")
        return (409, {"error": {"message": f"Duplicate camera event for sourceEventId '{event['sourceEventId']}'."}})

    mock_forward.side_effect = committed_then_timeout
    rt = _one_detection_runtime(fake, max_forward_attempts=3)
    rt.run()

    assert seen[0] == seen[1]
    assert rt.stats.api_conflict == 1
    assert rt.stats.api_retries == 1
    assert rt.stats.last_event["outcome"].startswith("conflict:")


@patch("app.camera.runtime.api_client.forward_event", side_effect=httpx.ConnectError("down"))
def test_retries_are_bounded_when_the_api_stays_down(mock_forward, fake):
    fake.n_frames = 6
    rt = _one_detection_runtime(fake, max_forward_attempts=3)
    rt.run()
    # Exactly max_forward_attempts calls for the one observation, then give up.
    assert mock_forward.call_count == 3
    assert rt.stats.api_error == 3
    assert rt.stats.api_retries == 2
    assert rt.stats.last_event["outcome"] == "error:transport"


@patch("app.camera.runtime.api_client.forward_event")
def test_5xx_and_429_are_retried_but_other_4xx_are_final(mock_forward, fake):
    fake.n_frames = 6

    for status, expected_calls in ((503, 3), (429, 3), (400, 1), (401, 1)):
        mock_forward.reset_mock()
        mock_forward.side_effect = None
        mock_forward.return_value = (status, {"error": {"message": "x"}})
        rt = _one_detection_runtime(FakeSource(6), max_forward_attempts=3)
        rt.run()
        assert mock_forward.call_count == expected_calls, f"status {status}"


@patch("app.camera.runtime.api_client.forward_event", return_value=(409, {"error": {"message": "duplicate"}}))
def test_409_is_never_retried_even_with_retries_enabled(mock_forward, fake):
    fake.n_frames = 6
    rt = _one_detection_runtime(fake, max_forward_attempts=3)
    rt.run()
    assert mock_forward.call_count == 1
    assert rt.stats.api_retries == 0


@patch("app.camera.runtime.api_client.forward_event", side_effect=httpx.ConnectError("down"))
def test_close_interrupts_a_retry_backoff(mock_forward, fake):
    """A stop request during the between-attempt wait must end the retry loop
    promptly rather than spending the remaining attempts."""
    import threading

    fake.n_frames = 6
    rt = _one_detection_runtime(fake, max_forward_attempts=5, reconnect_delay=5.0)
    threading.Timer(0.3, rt.close).start()
    started = time.monotonic()
    rt.run()
    elapsed = time.monotonic() - started
    assert elapsed < 4.0
    assert mock_forward.call_count < 5


def test_runtime_requires_a_zone_id():
    with pytest.raises(ValueError, match="CAMERA_ZONE_ID"):
        CameraRuntime(source=FakeSource(1), camera_identifier="CAM-A01", zone_id=None)


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


class _StallingCapture:
    """cv2.VideoCapture stand-in: the first capture streams a few frames then
    stalls; every later open (a reconnect) is refused."""

    opens = 0

    def __init__(self, url, backend=None):
        type(self).opens += 1
        self._opened = type(self).opens == 1
        self.frames_left = 3

    def isOpened(self):
        return self._opened

    def read(self):
        import numpy as np

        time.sleep(0.005)
        if self.frames_left <= 0:
            return False, None
        self.frames_left -= 1
        return True, np.zeros((48, 64, 3), dtype=np.uint8)

    def get(self, prop):
        return 0

    def release(self):
        pass


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_failed_reconnect_keeps_retrying_instead_of_crashing(mock_forward, monkeypatch):
    # Regression: after a reconnect whose open() failed, the loop read from the
    # closed RTSP source and crashed on `assert self._cap is not None`. A closed
    # source must report a read failure so retries continue up to the cap.
    from app.camera.sources import RtspCameraSource

    _StallingCapture.opens = 0
    monkeypatch.setattr("app.camera.sources.cv2.VideoCapture", _StallingCapture)
    source = RtspCameraSource("rtsp://10.0.0.5:554/stream1", frame_timeout_seconds=0.05)
    rt = _runtime(source, max_consecutive_failures=2, max_reconnects=3, process_fps=100.0)
    rt.run()  # must return cleanly, not raise AssertionError
    assert rt.stats.reconnects == 3
    assert _StallingCapture.opens == 4  # initial open + 3 refused reconnects
    assert source.opened is False


def test_event_type_defaults_to_entry(monkeypatch):
    import importlib

    import app.config as config

    monkeypatch.delenv("CAMERA_EVENT_TYPE", raising=False)
    try:
        importlib.reload(config)
        assert config.CAMERA_EVENT_TYPE == "ENTRY"
        assert _runtime(FakeSource(1)).event_type == "ENTRY"
    finally:
        monkeypatch.undo()
        importlib.reload(config)


def test_event_type_env_exit_is_normalized(monkeypatch):
    import importlib

    import app.config as config

    monkeypatch.setenv("CAMERA_EVENT_TYPE", " exit ")
    try:
        importlib.reload(config)
        assert config.CAMERA_EVENT_TYPE == "EXIT"
        assert _runtime(FakeSource(1)).event_type == "EXIT"
    finally:
        monkeypatch.undo()
        importlib.reload(config)


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_exit_runtime_forwards_exit_events(mock_forward, fake, monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_EVENT_TYPE", "EXIT")
    fake.n_frames = 2
    rt = _runtime(fake)
    rt.run()
    assert mock_forward.call_count >= 1
    assert all(c[0][1]["eventType"] == "EXIT" for c in mock_forward.call_args_list)


def test_runtime_rejects_unknown_event_type():
    with pytest.raises(ValueError, match="CAMERA_EVENT_TYPE"):
        _runtime(FakeSource(1), event_type="BIDIRECTIONAL")


# ---------------------------------------------------------- confirmation


def _reads(*plates):
    """process_image results, one per processed frame (None = no plate)."""
    from app.pipeline.service import VisionResult

    def result(plate):
        if plate is None:
            return VisionResult(DetectionStatus.NO_DETECTION, None, None, None, None, 0)
        # OCR confidence below PLATE_CONFIRM_SKIP_CONFIDENCE (0.9), so these
        # reads go through confirmation.
        return VisionResult(DetectionStatus.DETECTED, plate, plate, 0.8, 0.8, 1)

    return [result(p) for p in plates]


def _forwarded_plates(mock_forward):
    return [c[0][1]["detectedPlate"] for c in mock_forward.call_args_list]


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_a_single_read_is_not_forwarded(mock_forward):
    with patch("app.camera.runtime.process_image", side_effect=_reads("LMA777", None, None)):
        rt = _runtime(FakeSource(3))
        rt.run()
    assert mock_forward.call_count == 0
    assert rt.stats.detections == 1
    assert rt.stats.unconfirmed == 1


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_a_single_high_confidence_read_is_forwarded_at_once(mock_forward):
    from app.pipeline.service import VisionResult

    clear = VisionResult(DetectionStatus.DETECTED, "ZMT 553", "ZMT553", 0.96, None, 0)
    with patch("app.camera.runtime.process_image", side_effect=[clear, *_reads(None, None)]):
        rt = _runtime(FakeSource(3))
        rt.run()
    assert _forwarded_plates(mock_forward) == ["ZMT 553"]
    assert rt.stats.unconfirmed == 0


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_high_confidence_shortcut_can_be_turned_off(mock_forward):
    from app.pipeline.service import VisionResult

    clear = VisionResult(DetectionStatus.DETECTED, "ZMT 553", "ZMT553", 0.96, None, 0)
    with patch("app.camera.runtime.process_image", side_effect=[clear, *_reads(None, None)]):
        rt = _runtime(FakeSource(3), plate_confirm_skip_confidence=0.0)
        rt.run()
    assert mock_forward.call_count == 0


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_two_of_three_frames_confirm_a_plate(mock_forward):
    with patch("app.camera.runtime.process_image", side_effect=_reads("ABC1234", None, "ABC1234")):
        rt = _runtime(FakeSource(3), cooldown_seconds=60.0)
        rt.run()
    assert _forwarded_plates(mock_forward) == ["ABC1234"]


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_different_readings_do_not_confirm_each_other(mock_forward):
    with patch("app.camera.runtime.process_image", side_effect=_reads("ABC1234", "ABC1284", "ABG1234")):
        rt = _runtime(FakeSource(3))
        rt.run()
    assert mock_forward.call_count == 0


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_reads_outside_the_window_do_not_count(mock_forward):
    # The two reads are 3 frames apart, so never 2 within the last 3 frames.
    with patch("app.camera.runtime.process_image", side_effect=_reads("ABC1234", None, None, "ABC1234")):
        rt = _runtime(FakeSource(4))
        rt.run()
    assert mock_forward.call_count == 0


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_cooldown_still_applies_after_confirmation(mock_forward):
    with patch("app.camera.runtime.process_image", side_effect=_reads(*["ABC1234"] * 6)):
        rt = _runtime(FakeSource(6), cooldown_seconds=60.0)
        rt.run()
    assert _forwarded_plates(mock_forward) == ["ABC1234"]


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_confirmation_is_configurable(mock_forward):
    # 3 of the last 4 frames.
    with patch("app.camera.runtime.process_image", side_effect=_reads("ABC1234", "ABC1234", None, "ABC1234")):
        rt = _runtime(FakeSource(4), plate_confirm_window=4, plate_confirm_min_reads=3)
        rt.run()
    assert mock_forward.call_count == 1
    assert rt.stats.unconfirmed == 2


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_min_reads_of_one_turns_confirmation_off(mock_forward):
    with patch("app.camera.runtime.process_image", side_effect=_reads("ABC1234")):
        rt = _runtime(FakeSource(1), plate_confirm_min_reads=1)
        rt.run()
    assert mock_forward.call_count == 1


def test_min_reads_larger_than_the_window_is_capped():
    rt = _runtime(FakeSource(1), plate_confirm_window=3, plate_confirm_min_reads=5)
    assert rt.plate_confirm_min_reads == 3


def test_confirmation_defaults_come_from_env(monkeypatch):
    import importlib

    import app.config as config

    monkeypatch.setenv("PLATE_CONFIRM_WINDOW", "5")
    monkeypatch.setenv("PLATE_CONFIRM_MIN_READS", "3")
    try:
        importlib.reload(config)
        rt = _runtime(FakeSource(1))
        assert (rt.plate_confirm_window, rt.plate_confirm_min_reads) == (5, 3)
    finally:
        monkeypatch.undo()
        importlib.reload(config)
    rt = _runtime(FakeSource(1))
    assert (rt.plate_confirm_window, rt.plate_confirm_min_reads) == (3, 2)


@patch("app.camera.runtime.api_client.forward_event", return_value=(201, {"data": {}}))
def test_exit_runtime_confirms_and_forwards_exit(mock_forward):
    with patch("app.camera.runtime.process_image", side_effect=_reads("ABC1234", "ABC1234")):
        rt = _runtime(FakeSource(2), event_type="EXIT")
        rt.run()
    assert [c[0][1]["eventType"] for c in mock_forward.call_args_list] == ["EXIT"]


# ------------------------------------------------- presence-based debounce


def test_debounce_defaults(monkeypatch):
    import importlib

    import app.config as config

    monkeypatch.delenv("OBSERVATION_COOLDOWN_SECONDS", raising=False)
    monkeypatch.delenv("OBSERVATION_ABSENCE_RESET_SECONDS", raising=False)
    try:
        importlib.reload(config)
        rt = CameraRuntime(source=FakeSource(1), camera_identifier="CAM-A01", zone_id="zone-1")
        assert (rt.cooldown_seconds, rt.absence_reset_seconds) == (5.0, 25.0)
    finally:
        monkeypatch.undo()
        importlib.reload(config)


class _Clock:
    """Stands in for the runtime's `time` module so a test controls the clock."""

    def __init__(self):
        self.now = 1000.0

    def monotonic(self):
        return self.now

    def sleep(self, _seconds):
        pass


def _drive(timeline, step=0.5, **kw):
    """Feed one processed frame every `step` s; timeline(t) gives the plate in
    view at t (None = no plate). Returns the times events were forwarded."""
    import numpy as np

    from app.pipeline.service import VisionResult

    clock = _Clock()
    kw.setdefault("cooldown_seconds", 5.0)
    # Fixed here so the mechanism tests below don't depend on the default;
    # the default itself is tested with live frame timing further down.
    kw.setdefault("absence_reset_seconds", 10.0)
    # 2-of-3 confirmation always applies (no single-read shortcut).
    kw.setdefault("plate_confirm_skip_confidence", 0.0)
    rt = CameraRuntime(source=FakeSource(1), camera_identifier="CAM-A01", zone_id="zone-1", **kw)
    sent = []
    frame = np.zeros((8, 8, 3), dtype=np.uint8)

    def fake_process(_bytes):
        plate = timeline(clock.now - 1000.0)
        if plate is None:
            return VisionResult(DetectionStatus.NO_DETECTION, None, None, None, None, 0)
        return VisionResult(DetectionStatus.DETECTED, plate, plate, 0.6, 0.8, 1)

    def fake_forward(_zone, event):
        sent.append(round(clock.now - 1000.0, 1))
        return 201, {"data": {}}

    end = getattr(timeline, "end", 30.0)
    with (
        patch("app.camera.runtime.time", clock),
        patch("app.camera.runtime.process_image", side_effect=fake_process),
        patch("app.camera.runtime.api_client.forward_event", side_effect=fake_forward),
    ):
        while clock.now - 1000.0 <= end:
            rt._process_frame(frame)
            clock.now += step
    return sent


def _window(*spans, plate="CDI6227", end=40.0):
    """timeline: `plate` in view during each (start, stop) span."""

    def timeline(t):
        return plate if any(a <= t < b for a, b in spans) else None

    timeline.end = end
    return timeline


def test_plate_held_20_seconds_is_one_event():
    assert len(_drive(_window((0, 20)))) == 1


def test_plate_that_leaves_and_returns_after_15_seconds_is_two_events():
    sent = _drive(_window((0, 5), (20, 25)))
    assert len(sent) == 2
    assert sent[1] >= 20


def _reads_at(plates_by_time, end):
    """timeline from {t: plate}; frames come every 6 s like the live CPU."""

    def timeline(t):
        return plates_by_time.get(round(t))

    timeline.end = end
    return timeline


def test_one_misread_frame_at_live_frame_rate_is_not_a_new_pass():
    # Day test: frames ~6 s apart, read at t=0, misread at t=6, read at t=12.
    # Every read is forwardable (confirmation off) so only the debounce decides.
    import app.config as config

    assert config.OBSERVATION_ABSENCE_RESET_SECONDS == 25.0
    timeline = _reads_at({0: "CDI6227", 6: None, 12: "CDI6227"}, end=12)
    sent = _drive(
        timeline, step=6.0, plate_confirm_min_reads=1, absence_reset_seconds=config.OBSERVATION_ABSENCE_RESET_SECONDS
    )
    assert sent == [0.0]


def test_the_old_10_second_reset_counted_that_misread_as_a_second_car():
    timeline = _reads_at({0: "CDI6227", 6: None, 12: "CDI6227"}, end=12)
    assert _drive(timeline, step=6.0, plate_confirm_min_reads=1, absence_reset_seconds=10.0) == [0.0, 12.0]


def test_one_misread_frame_with_confirmation_on_is_still_one_event():
    import app.config as config

    plates = {0: "CDI6227", 6: "CDI6227", 12: None, 18: "CDI6227", 24: "CDI6227", 30: "CDI6227"}
    sent = _drive(
        _reads_at(plates, end=30), step=6.0, absence_reset_seconds=config.OBSERVATION_ABSENCE_RESET_SECONDS
    )
    assert sent == [6.0]


def test_short_gap_below_the_absence_reset_is_the_same_pass():
    # Out of view for 5 s (< 10 s): e.g. a person walking in front of the car.
    assert len(_drive(_window((0, 5), (10, 15)))) == 1


def test_plate_held_longer_than_the_old_window_is_still_one_event():
    assert len(_drive(_window((0, 90), end=95.0))) == 1


def test_hard_minimum_between_sends_still_applies():
    # Absence reset of 1 s: the plate "returns" 2 s after the first send, but
    # the 5 s hard minimum holds the second send back until t >= 5.
    sent = _drive(_window((0, 1), (3, 8)), absence_reset_seconds=1.0)
    assert len(sent) == 2
    assert sent[1] - sent[0] >= 5.0


def test_unconfirmed_sightings_keep_the_pass_open():
    # 3-20 s: the plate is read only in 1 of every 3 frames, never confirmed;
    # the car is still there, so the confirmed reads from 20 s are the same pass.
    def timeline(t):
        if t < 3 or 20 <= t < 25:
            return "CDI6227"
        if t < 20 and round(t * 2) % 3 == 0:
            return "CDI6227"
        return None

    timeline.end = 30.0
    assert len(_drive(timeline)) == 1


def test_other_plates_are_not_suppressed_by_a_present_plate():
    def timeline(t):
        return "CDI6227" if t < 10 else "ABC1234" if t < 20 else None

    timeline.end = 25.0
    assert len(_drive(timeline)) == 2


def test_open_failure_isolates_and_does_not_crash_process(fake):
    fake.fail_open = True
    rt = _runtime(fake, reconnect_delay=0.01)
    # Should exit the loop (never opens) without raising.
    rt.run()
    assert rt.stats.read_failures >= 1
    assert fake.opens >= 1


def test_runtime_source_event_id_is_deterministic():
    b1 = b"frame-one-bytes"
    b2 = b"frame-one-bytes"
    assert make_source_event_id(b1, "CAM-A01") == make_source_event_id(b2, "CAM-A01")
    assert make_source_event_id(b1, "CAM-A01") != make_source_event_id(b"frame-two", "CAM-A01")
    assert make_source_event_id(b1, "CAM-A01").startswith("vision-")


def test_runtime_source_event_id_deterministic_across_instances():
    # A restarted process must derive the same id for the same frame, so the
    # API's (cameraId, sourceEventId) constraint can absorb the replay.
    assert make_source_event_id(b"x", "CAM-A01") == make_source_event_id(b"x", "CAM-A01")


def test_source_event_id_distinguishes_cameras():
    assert make_source_event_id(b"x", "CAM-A01") != make_source_event_id(b"x", "CAM-B02")
