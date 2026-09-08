"""Factory selecting the concrete CameraSource from runtime configuration.

Source selection is driven by trusted, server-side environment/config — never
by an unauthenticated inbound request (no SSRF surface). DOMAIN semantics
(which camera, which zone, which direction) remain with the API.
"""

from __future__ import annotations

from .. import config as vision_config
from .base import CameraSource, CameraSourceError, SourceType
from .sources import FileCameraSource, RtspCameraSource, UsbCameraSource


def create_camera_source(
    *,
    source_type: str | None = None,
    device_index: int | None = None,
    file_path: str | None = None,
    url: str | None = None,
) -> CameraSource:
    """Build a source from explicit args, falling back to env config.

    - "usb"  -> UsbCameraSource(device_index or CAMERA_DEVICE_INDEX)
    - "rtsp" -> RtspCameraSource(url or VIDEO_SOURCE)
    - "file" -> FileCameraSource(file_path or CAMERA_FILE_PATH)
    """
    kind = (source_type or vision_config.CAMERA_SOURCE or "file").strip().lower()

    if kind == SourceType.USB.value:
        idx = device_index if device_index is not None else vision_config.CAMERA_DEVICE_INDEX
        return UsbCameraSource(int(idx))
    if kind == SourceType.RTSP.value:
        target = url or vision_config.VIDEO_SOURCE
        if not target:
            raise CameraSourceError("RTSP source configured but VIDEO_SOURCE is empty.")
        return RtspCameraSource(target)
    if kind == SourceType.FILE.value:
        path = file_path or vision_config.CAMERA_FILE_PATH
        if not path:
            raise CameraSourceError(
                "File source configured but CAMERA_FILE_PATH is empty. "
                "Point it at a fixture video, or set CAMERA_SOURCE=usb/rtsp."
            )
        return FileCameraSource(path)
    raise CameraSourceError(
        f"Unknown CAMERA_SOURCE '{kind}'. Expected one of: usb, rtsp, file."
    )
