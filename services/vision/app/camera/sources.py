"""Concrete camera sources over OpenCV VideoCapture.

Each source only opens/reads/closes a capture. None of them apply OCR or
business logic — frames flow to the shared pipeline unchanged.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

import cv2
import numpy as np

from .base import CameraSource, CameraSourceError, FrameReadError, SourceType

logger = logging.getLogger("parada.vision.camera")

# The same backends OpenCV probes for USB/RTSP. Keeping the list explicit and
# ordered gives deterministic failures instead of relying on opaque defaults.
_CAP_ANY = cv2.CAP_ANY
_CAP_FFMPEG = cv2.CAP_FFMPEG if hasattr(cv2, "CAP_FFMPEG") else cv2.CAP_ANY


class UsbCameraSource(CameraSource):
    """Reads from a local USB (or /dev/video*) device by index."""

    source_type = SourceType.USB

    def __init__(self, device_index: int = 0) -> None:
        super().__init__()
        if not isinstance(device_index, int) or device_index < 0:
            raise CameraSourceError("USB device index must be a non-negative integer.")
        self.device_index = device_index
        self._cap: Optional[cv2.VideoCapture] = None

    def open(self) -> None:
        self.close()
        logger.info("opening USB camera device index=%d", self.device_index)
        cap = cv2.VideoCapture(self.device_index, _CAP_ANY)
        if cap is None or not cap.isOpened():
            try:
                if cap is not None:
                    cap.release()
            except Exception:  # pragma: no cover - defensive
                pass
            self._opened = False
            raise CameraSourceError(
                f"USB camera device {self.device_index} could not be opened "
                "(no device, or permission/access denied)."
            )
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self._cap = cap
        self._opened = True
        logger.info("USB camera device=%d opened", self.device_index)

    def read_frame(self) -> np.ndarray:
        if self._cap is None:
            raise FrameReadError("USB camera is not open.")
        ok, frame = self._cap.read()
        if not ok or frame is None or frame.size == 0:
            raise FrameReadError(f"USB device {self.device_index} returned no frame.")
        return frame

    def resolution(self) -> tuple[int, int]:
        if self._cap is None:
            return (0, 0)
        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        return (w, h)

    def close(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:  # pragma: no cover - defensive
                pass
            self._cap = None
        self._opened = False

    def describe(self) -> dict:
        d = super().describe()
        d["deviceIndex"] = self.device_index
        return d


class RtspCameraSource(CameraSource):
    """Reads from an IP/RTSP camera stream by URL.

    Credentials embedded in the URL are used ONLY at open() time and are never
    included in describe()/status_text()/exceptions/logs.

    A live camera pushes frames at its own rate (e.g. 25 fps) while the runtime
    only reads at VISION_PROCESS_FPS. Read that slowly, the stream backs up and
    the camera drops the session within ~30 s. A background reader therefore
    drains the stream continuously and keeps only the newest frame;
    read_frame() hands that frame out.
    """

    source_type = SourceType.RTSP

    def __init__(self, url: str, frame_timeout_seconds: float = 2.0) -> None:
        super().__init__()
        if not isinstance(url, str) or not url.strip():
            raise CameraSourceError("RTSP URL is required.")
        if not url.startswith(("rtsp://", "rtsps://")):
            raise CameraSourceError("RTSP source must use an rtsp:// or rtsps:// URL.")
        self.url = url
        self.frame_timeout_seconds = frame_timeout_seconds
        self._cap: Optional[cv2.VideoCapture] = None
        self._resolution: tuple[int, int] = (0, 0)
        self._reader: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._frame_cond = threading.Condition()
        self._latest: Optional[np.ndarray] = None
        self._latest_seq = 0
        self._returned_seq = 0

    def open(self) -> None:
        self.close()
        logger.info("opening RTSP camera stream")
        cap = cv2.VideoCapture(self.url, _CAP_FFMPEG)
        if cap is None or not cap.isOpened():
            try:
                if cap is not None:
                    cap.release()
            except Exception:  # pragma: no cover - defensive
                pass
            self._opened = False
            raise CameraSourceError("RTSP stream could not be opened (unreachable or refused).")
        # Read once here: the reader thread owns the capture from now on.
        self._resolution = (
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
        )
        self._cap = cap
        self._stop = threading.Event()
        self._latest = None
        self._latest_seq = 0
        self._returned_seq = 0
        self._reader = threading.Thread(
            target=self._read_loop, args=(cap, self._stop), name="rtsp-reader", daemon=True
        )
        self._reader.start()
        self._opened = True

    def _read_loop(self, cap: cv2.VideoCapture, stop: threading.Event) -> None:
        # The thread releases its own capture, so close() never releases one
        # mid-read (a blocked FFMPEG read can outlive the join timeout).
        try:
            while not stop.is_set():
                ok, frame = cap.read()
                if not ok or frame is None or frame.size == 0:
                    # No frame: read_frame() times out and the runtime reconnects.
                    stop.wait(0.05)
                    continue
                with self._frame_cond:
                    if stop.is_set():
                        break
                    self._latest = frame
                    self._latest_seq += 1
                    self._frame_cond.notify_all()
        finally:
            try:
                cap.release()
            except Exception:  # pragma: no cover - defensive
                pass

    def read_frame(self) -> np.ndarray:
        # Closed (e.g. a reconnect whose open() failed): a read failure, so the
        # runtime keeps retrying within MAX_CAMERA_RECONNECTS instead of crashing.
        if self._cap is None:
            raise FrameReadError("RTSP stream is not open.")
        with self._frame_cond:
            # Only hand out a frame newer than the last one returned; a stalled
            # stream must surface as a read failure, not a repeated stale frame.
            got = self._frame_cond.wait_for(
                lambda: self._latest_seq > self._returned_seq, timeout=self.frame_timeout_seconds
            )
            if not got or self._latest is None:
                raise FrameReadError("RTSP stream returned no frame.")
            self._returned_seq = self._latest_seq
            return self._latest

    def resolution(self) -> tuple[int, int]:
        if self._cap is None:
            return (0, 0)
        return self._resolution

    def close(self) -> None:
        self._stop.set()
        if self._reader is not None:
            self._reader.join(timeout=5.0)
            self._reader = None
        self._cap = None
        with self._frame_cond:
            self._latest = None
        self._resolution = (0, 0)
        self._opened = False

    def describe(self) -> dict:
        d = super().describe()
        # Redact any userinfo (user:password) from the URL before surfacing it.
        from urllib.parse import urlsplit, urlunsplit

        parts = urlsplit(self.url)
        if parts.username is not None or parts.password is not None:
            netloc = parts.hostname or ""
            if parts.port:
                netloc = f"{netloc}:{parts.port}"
            d["host"] = urlunsplit((parts.scheme, netloc, parts.path, "", ""))
        else:
            d["host"] = self.url
        return d


class FileCameraSource(CameraSource):
    """Reads a local video file for deterministic development/testing.

    The file must exist and be a decodable container. Loop-nothing; the
    runtime's frame loop stops naturally at end-of-stream and reports it, so a
    finite fixture does not spin forever.
    """

    source_type = SourceType.FILE

    def __init__(self, path: str) -> None:
        super().__init__()
        if not isinstance(path, str) or not path.strip():
            raise CameraSourceError("Video file path is required.")
        self.path = path
        self._cap: Optional[cv2.VideoCapture] = None
        self._frames_read = 0

    def open(self) -> None:
        self.close()
        if not os.path.isfile(self.path):
            raise CameraSourceError(f"Video file not found: {self.path}")
        logger.info("opening video file source path=%s", self.path)
        cap = cv2.VideoCapture(self.path, _CAP_FFMPEG)
        if cap is None or not cap.isOpened():
            try:
                if cap is not None:
                    cap.release()
            except Exception:  # pragma: no cover - defensive
                pass
            self._opened = False
            raise CameraSourceError(f"Video file could not be decoded: {self.path}")
        self._cap = cap
        self._opened = True
        self._frames_read = 0

    def read_frame(self) -> np.ndarray:
        if self._cap is None:
            raise FrameReadError("Video file is not open.")
        ok, frame = self._cap.read()
        if not ok or frame is None or frame.size == 0:
            if self.is_finished():
                raise FrameReadError("EOF")
            raise FrameReadError("Video file returned no frame.")
        self._frames_read += 1
        return frame

    def is_finished(self) -> bool:
        if self._cap is None:
            return True
        pos = float(self._cap.get(cv2.CAP_PROP_POS_FRAMES))
        total = float(self._cap.get(cv2.CAP_PROP_FRAME_COUNT))
        return total > 0 and pos >= total

    def resolution(self) -> tuple[int, int]:
        if self._cap is None:
            return (0, 0)
        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        return (w, h)

    def close(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:  # pragma: no cover - defensive
                pass
            self._cap = None
        self._opened = False

    def describe(self) -> dict:
        d = super().describe()
        d["path"] = self.path
        return d
