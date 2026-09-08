"""Physical camera source abstraction and runtime (Phase 11C).

All sources converge on a single `CameraSource` interface and feed the SAME
downstream vision pipeline (`app/pipeline/service.process_image`) — there is
no per-source OCR/business path. Vision never touches Prisma/PostgreSQL; the
only downstream call it makes is the existing API event endpoint.

    CameraSource
        ├── UsbCameraSource
        ├── RtspCameraSource
        └── FileCameraSource
"""

from .base import CameraSource, CameraSourceError, FrameReadError, SourceType
from .factory import create_camera_source
from .runtime import CameraRuntime

__all__ = [
    "CameraSource",
    "CameraSourceError",
    "FrameReadError",
    "SourceType",
    "create_camera_source",
    "CameraRuntime",
]
