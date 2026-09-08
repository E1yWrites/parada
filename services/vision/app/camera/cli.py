"""Development CLI for the physical camera runtime (Phase 11C).

Modes:
    python -m app.camera.cli test      -- open the source, grab one frame, report
                                          connection state / resolution / whether a
                                          plate can be read. No credentials printed.
    python -m app.camera.cli run       -- full frame->OCR->API loop (stops on
                                          Ctrl-C / SIGTERM, or end of a video file).

Source is selected from environment (CAMERA_SOURCE, CAMERA_DEVICE_INDEX,
CAMERA_FILE_PATH, VIDEO_SOURCE, CAMERA_IDENTIFIER, CAMERA_ZONE_ID,
VISION_PROCESS_FPS). This is the same Vision service entry point — there is no
separate "test-only" app, and every mode uses the shared pipeline.
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys

import cv2

from .base import CameraSourceError
from .factory import create_camera_source
from .runtime import CameraRuntime

logger = logging.getLogger("parada.vision.cli")


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )


def _test(source, camera_identifier: str) -> int:
    print("Vision camera connection test")
    print(f"  camera identifier : {camera_identifier}")
    try:
        source.open()
    except CameraSourceError as exc:
        print(f"  FAILED to open source: {exc}")
        return 1

    d = source.describe()
    print(f"  source            : {d['source']}")
    print(f"  connected         : {d['connected']}")
    print(f"  streaming         : {d['streaming']}")
    print(f"  resolution        : {d['width']}x{d['height']}")

    try:
        frame = source.read_frame()
    except Exception as exc:  # FrameReadError or unexpected
        print(f"  FAILED to read a frame: {exc}")
        source.close()
        return 1

    encode_ok, buf = cv2.imencode(".jpg", frame)
    if not encode_ok:
        print("  FAILED to encode frame")
        source.close()
        return 1

    from ..pipeline.service import process_image

    result = process_image(buf.tobytes())
    if result.status.value == "DETECTED" and result.normalized_plate:
        print(f"  frame available   : yes")
        print(f"  plate read        : {result.normalized_plate} (conf {result.ocr_confidence:.2f})")
        print("Vision pipeline OK")
        return 0
    if result.status.value == "NO_DETECTION":
        print("  frame available   : yes")
        print("  plate read        : none (no plate region in frame)")
        print("Vision pipeline OK (no plate in probe frame)")
        return 0
    print(f"  frame available   : yes")
    print("  plate read        : ocr failed (no readable plate)")
    print("Vision pipeline OK (no readable plate in probe frame)")
    return 0


def _run(source, camera_identifier: str, zone_id: str | None) -> int:
    runtime = CameraRuntime(source=source, camera_identifier=camera_identifier, zone_id=zone_id)

    def _sig(*_args):
        print("\nshutting down (signal received)...")
        runtime.close()

    prev = signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    runtime.run()

    # Restore handlers so Ctrl-C during shutdown behaves normally.
    signal.signal(signal.SIGINT, prev)
    s = runtime.stats
    print("shutdown complete")
    print(f"  frames read       : {s.frames_read}")
    print(f"  frames processed  : {s.frames_processed}")
    print(f"  detections        : {s.detections}")
    print(f"  forwarded         : {s.forwarded}")
    print(f"  api ok/conflict   : {s.api_ok}/{s.api_conflict}")
    print(f"  reconnects        : {s.reconnects}")
    return 0


def main(argv: list[str] | None = None) -> int:
    _setup_logging()
    parser = argparse.ArgumentParser(prog="vision-camera", description="PARADA camera runtime")
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("test", help="open the configured source and report health")
    runp = sub.add_parser("run", help="run the full frame->OCR->API loop")
    runp.add_argument("--zone-id", help="explicit zone id (optional; API resolves by default)")

    args = parser.parse_args(argv)

    from .. import config as vision_config

    try:
        source = create_camera_source()
    except CameraSourceError as exc:
        print(f"configuration error: {exc}")
        return 2

    if args.mode == "test":
        try:
            return _test(source, vision_config.CAMERA_IDENTIFIER)
        except KeyboardInterrupt:
            return 130
    return _run(source, vision_config.CAMERA_IDENTIFIER, args.zone_id or (vision_config.CAMERA_ZONE_ID or None))


if __name__ == "__main__":
    sys.exit(main())
