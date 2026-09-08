"""Concrete camera sources over OpenCV VideoCapture.

Each source only opens/reads/closes a capture. None of them apply OCR or
business logic — frames flow to the shared pipeline unchanged.
"""

from __future__ import annotations

import logging
import os
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
        assert self._cap is not None
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
    """

    source_type = SourceType.RTSP

    def __init__(self, url: str) -> None:
        super().__init__()
        if not isinstance(url, str) or not url.strip():
            raise CameraSourceError("RTSP URL is required.")
        if not url.startswith(("rtsp://", "rtsps://")):
            raise CameraSourceError("RTSP source must use an rtsp:// or rtsps:// URL.")
        self.url = url
        self._cap: Optional[cv2.VideoCapture] = None

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
        self._cap = cap
        self._opened = True

    def read_frame(self) -> np.ndarray:
        assert self._cap is not None
        ok, frame = self._cap.read()
        if not ok or frame is None or frame.size == 0:
            raise FrameReadError("RTSP stream returned no frame.")
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
        assert self._cap is not None
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
