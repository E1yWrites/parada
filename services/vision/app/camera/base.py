"""CameraSource interface: the smallest contract the vision pipeline needs.

Implementations wrap OpenCV's VideoCapture. Every source opens a stream,
yields BGR frames, and reports its own connection/resolution state without
exposing credentials.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional

import numpy as np


class SourceType(str, Enum):
    USB = "usb"
    RTSP = "rtsp"
    FILE = "file"


class CameraSourceError(Exception):
    """Raised when a source cannot be opened (device gone, permission denied,
    RTSP unreachable, bad file path). Carries a human-safe message with no
    credentials."""


class FrameReadError(Exception):
    """Raised mid-stream when a read fails (frame grab timeout, decode error,
    disconnection while streaming). The runtime may attempt to reconnect."""


class CameraSource(ABC):
    """A frame source. Only what the pipeline needs: open, read, close, state."""

    source_type: SourceType

    def __init__(self) -> None:
        self._opened = False

    @property
    def opened(self) -> bool:
        return self._opened

    @abstractmethod
    def open(self) -> None:
        """Open the underlying stream/device. Blocking up to a bounded timeout.
        Raises CameraSourceError on failure; must not crash the process."""

    @abstractmethod
    def read_frame(self) -> np.ndarray:
        """Return the next BGR frame. Raises FrameReadError on failure."""

    @abstractmethod
    def resolution(self) -> tuple[int, int]:
        """(width, height) of the stream, or (0, 0) when unknown."""

    def close(self) -> None:
        """Release all resources (OpenCV capture, sockets). Idempotent."""
        self._opened = False

    @property
    def status_text(self) -> str:
        """Short, credential-free status line for logs/connection test."""
        return f"{self.source_type.value} {'connected' if self.opened else 'disconnected'}"

    def describe(self) -> dict:
        """Credential-free diagnostic descriptor for the connection test."""
        w, h = self.resolution() if self.opened else (0, 0)
        return {
            "source": self.source_type.value,
            "connected": self.opened,
            "streaming": self.opened and w > 0 and h > 0,
            "width": w,
            "height": h,
        }
