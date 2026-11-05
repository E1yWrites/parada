"""Unit tests for the camera source abstraction and factory (Phase 11C).

No physical hardware is touched: sources are exercised either with the
synthetic pages/fixture video already provided, or through a FakeSource that
mocks the hardware contract (open/read/close/reconnect).
"""

import io
import os

import cv2
import numpy as np
import pytest

from app.camera.base import CameraSourceError, FrameReadError, SourceType
from app.camera.factory import create_camera_source
from app.camera.sources import FileCameraSource, RtspCameraSource, UsbCameraSource

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "videos")
VIDEO = os.path.join(FIXTURES, "clear_plate.mp4")


class FakeSource:
    """Deterministic stand-in for a camera: emits N 'clear' frames then fails."""

    source_type = SourceType.USB

    def __init__(self, n_frames: int = 3, fail_open: bool = False, fail_after_reads: int | None = None):
        self.n_frames = n_frames
        self.fail_open = fail_open
        self.fail_after_reads = fail_after_reads
        self.reads = 0
        self.opens = 0
        self.closed = 0
        self._opened = False

    def _make_frame(self) -> np.ndarray:
        # Reuse the clear plate PNG so the runtime's real pipeline finds a plate.
        png = os.path.join(os.path.dirname(__file__), "fixtures", "images", "clear_plate.png")
        frame = cv2.imread(png)
        if frame is None:
            frame = np.zeros((600, 800, 3), dtype=np.uint8)
        return frame

    @property
    def opened(self) -> bool:
        return self._opened

    def open(self) -> None:
        self.opens += 1
        if self.fail_open:
            raise CameraSourceError("no device")
        self._opened = True

    def read_frame(self) -> np.ndarray:
        if not self._opened:
            raise FrameReadError("not opened")
        if self.fail_after_reads is not None and self.reads >= self.fail_after_reads:
            self.reads += 1
            raise FrameReadError("lost stream")
        if self.reads >= self.n_frames:
            self.reads += 1
            raise FrameReadError("EOF-loaded fake")
        self.reads += 1
        return self._make_frame()

    def close(self) -> None:
        self.closed += 1
        self._opened = False

    def resolution(self) -> tuple[int, int]:
        return (800, 600) if self._opened else (0, 0)

    def describe(self) -> dict:
        d = {"source": "usb", "connected": self._opened, "streaming": self._opened, "width": 800, "height": 600}
        return d


# --------------------------------------------------------------------------- USB


def test_usb_source_validates_device_index():
    with pytest.raises(CameraSourceError):
        UsbCameraSource(device_index=-1)
    with pytest.raises(CameraSourceError):
        UsbCameraSource(device_index="nope")  # type: ignore[arg-type]


def test_usb_source_does_not_require_hardware_at_construction():
    src = UsbCameraSource(device_index=0)
    assert src.source_type == SourceType.USB
    assert src.opened is False
    assert src.device_index == 0


def test_usb_describe_contains_device_index_only():
    src = UsbCameraSource(device_index=7)
    d = src.describe()
    assert d["source"] == "usb"
    assert d["deviceIndex"] == 7
    assert "credentials" not in d


# --------------------------------------------------------------------------- RTSP


def test_rtsp_source_rejects_non_rtsp_protocol():
    with pytest.raises(CameraSourceError):
        RtspCameraSource("http://10.0.0.5/snapshot")
    with pytest.raises(CameraSourceError):
        RtspCameraSource("")
    with pytest.raises(CameraSourceError):
        RtspCameraSource("   ")


def test_rtsp_describe_redacts_credentials():
    src = RtspCameraSource(url="rtsp://admin:sekret@10.0.0.5:554/stream")
    d = src.describe()
    assert "admin" not in str(d["host"])
    assert "sekret" not in str(d["host"])
    assert d["host"].startswith("rtsp://10.0.0.5:554")
    assert src.url  # original still available for open()


class FakeRtspCapture:
    """Stands in for cv2.VideoCapture on a live stream: every read() returns a
    new frame stamped with its sequence number (pixel [0,0,0]), paced like a
    camera, until `live` is cleared."""

    def __init__(self, url, backend=None, opened: bool = True):
        self.url = url
        self._opened = opened
        self.reads = 0
        self.released = False
        self.live = True

    def isOpened(self) -> bool:
        return self._opened

    def read(self):
        import time

        time.sleep(0.005)
        if not self.live:
            return False, None
        self.reads += 1
        frame = np.zeros((48, 64, 3), dtype=np.uint8)
        frame[0, 0, 0] = self.reads % 256
        return True, frame

    def get(self, prop):
        return {cv2.CAP_PROP_FRAME_WIDTH: 64, cv2.CAP_PROP_FRAME_HEIGHT: 48}.get(prop, 0)

    def release(self) -> None:
        self.released = True


@pytest.fixture
def fake_rtsp(monkeypatch):
    caps: list[FakeRtspCapture] = []

    def factory(url, backend=None):
        cap = FakeRtspCapture(url, backend)
        caps.append(cap)
        return cap

    monkeypatch.setattr("app.camera.sources.cv2.VideoCapture", factory)
    return caps


def test_rtsp_open_failure_raises_clean_error(monkeypatch):
    monkeypatch.setattr(
        "app.camera.sources.cv2.VideoCapture", lambda url, backend=None: FakeRtspCapture(url, opened=False)
    )
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1")
    with pytest.raises(CameraSourceError):
        src.open()
    assert src.opened is False


def test_rtsp_reader_drains_stream_while_consumer_is_slow(fake_rtsp):
    import time

    # Regression: reading only at VISION_PROCESS_FPS let a real camera's
    # stream back up until the camera dropped the session. The source must
    # keep pulling frames while the runtime is busy (e.g. running OCR).
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1")
    src.open()
    try:
        first = src.read_frame()
        time.sleep(0.3)  # consumer busy
        assert fake_rtsp[0].reads > 10
        newest = src.read_frame()
        # The newest frame is returned, not the next stale one in a buffer.
        assert int(newest[0, 0, 0]) - int(first[0, 0, 0]) > 10
        assert src.resolution() == (64, 48)
        assert src.describe()["streaming"] is True
    finally:
        src.close()


def test_rtsp_read_frame_never_returns_the_same_frame_twice(fake_rtsp):
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1")
    src.open()
    try:
        stamps = [int(src.read_frame()[0, 0, 0]) for _ in range(5)]
        assert all(b != a for a, b in zip(stamps, stamps[1:]))
    finally:
        src.close()


def test_rtsp_stalled_stream_raises_frame_read_error(fake_rtsp):
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1", frame_timeout_seconds=0.2)
    src.open()
    try:
        src.read_frame()
        fake_rtsp[0].live = False
        try:
            src.read_frame()  # a frame produced just before the stall may be pending
        except FrameReadError:
            pass
        with pytest.raises(FrameReadError):
            src.read_frame()
    finally:
        src.close()


def test_rtsp_close_stops_reader_and_releases_capture(fake_rtsp):
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1")
    src.open()
    reader = src._reader
    src.close()
    assert reader is not None and not reader.is_alive()
    assert fake_rtsp[0].released is True
    assert src.opened is False
    assert src.resolution() == (0, 0)


@pytest.mark.parametrize(
    "make_source",
    [
        lambda: RtspCameraSource("rtsp://10.0.0.5:554/stream1"),
        lambda: UsbCameraSource(device_index=0),
        lambda: FileCameraSource(VIDEO),
    ],
    ids=["rtsp", "usb", "file"],
)
def test_reading_a_closed_source_raises_frame_read_error(make_source):
    # Never opened, or closed by a reconnect whose open() failed: a read
    # failure the runtime can retry, not an AssertionError that kills it.
    src = make_source()
    with pytest.raises(FrameReadError):
        src.read_frame()


def test_rtsp_read_after_close_raises_frame_read_error(fake_rtsp):
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1")
    src.open()
    src.read_frame()
    src.close()
    with pytest.raises(FrameReadError):
        src.read_frame()


def test_rtsp_reopen_starts_a_fresh_reader(fake_rtsp):
    src = RtspCameraSource("rtsp://10.0.0.5:554/stream1")
    src.open()
    src.read_frame()
    src.open()  # runtime reconnect path: open() closes the old stream first
    try:
        assert len(fake_rtsp) == 2
        assert fake_rtsp[0].released is True
        assert src.read_frame() is not None
    finally:
        src.close()


# --------------------------------------------------------------------------- File


def test_file_source_requires_path_string():
    with pytest.raises(CameraSourceError):
        FileCameraSource("")
    with pytest.raises(CameraSourceError):
        FileCameraSource("   ")


def test_file_source_open_requires_existing_path():
    src = FileCameraSource("/does/not/exist.mp4")
    with pytest.raises(CameraSourceError):
        src.open()


def test_file_source_reads_frames_from_fixture_video():
    src = FileCameraSource(VIDEO)
    src.n_frames = 100
    src.open()
    try:
        assert src.opened is True
        frame = src.read_frame()
        assert frame.ndim == 3
        assert frame.size > 0
        res = src.resolution()
        assert res[0] > 0 and res[1] > 0
    finally:
        src.close()
    assert src.opened is False


def test_file_source_describe():
    src = FileCameraSource(VIDEO)
    d = src.describe()
    assert d["source"] == "file"
    assert d["path"] == VIDEO


# --------------------------------------------------------------------------- Factory


def test_factory_unknown_source_raises(monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "bluetooth")
    with pytest.raises(CameraSourceError):
        create_camera_source()


def test_factory_usb_default_device_index(monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "usb")
    monkeypatch.setattr("app.config.CAMERA_DEVICE_INDEX", 3)
    src = create_camera_source()
    assert isinstance(src, UsbCameraSource)
    assert src.device_index == 3


def test_factory_rtsp_uses_video_source(monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "rtsp")
    monkeypatch.setattr("app.config.VIDEO_SOURCE", "rtsp://192.168.1.10/live")
    src = create_camera_source()
    assert isinstance(src, RtspCameraSource)
    assert src.url == "rtsp://192.168.1.10/live"


def test_factory_file_uses_file_path(monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "file")
    monkeypatch.setattr("app.config.CAMERA_FILE_PATH", VIDEO)
    src = create_camera_source()
    assert isinstance(src, FileCameraSource)
    assert src.path == VIDEO


def test_factory_file_with_missing_path_raises(monkeypatch):
    monkeypatch.setattr("app.config.CAMERA_SOURCE", "file")
    monkeypatch.setattr("app.config.CAMERA_FILE_PATH", "")
    with pytest.raises(CameraSourceError):
        create_camera_source()


