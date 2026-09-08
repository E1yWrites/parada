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


