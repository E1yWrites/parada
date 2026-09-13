"""Phase 14 — physical camera source probe (USB / RTSP), measurement only.

    python -m evaluation.run_camera_probe [--frames 30] [--out evaluation/results]

Uses the SAME source classes the Phase 11C runtime uses
(`app.camera.factory.create_camera_source` from CAMERA_SOURCE /
CAMERA_DEVICE_INDEX / VIDEO_SOURCE) and the same `process_image` pipeline, so
this measures the real hardware path: open latency, negotiated resolution,
frame-read latency, and what the pipeline reports for live frames.

Privacy: frames are processed in memory and discarded. No image, crop, or
pixel data is written anywhere — only per-frame status/confidence/timing.
Whatever is in front of the camera is NOT a licence plate unless one is held
up deliberately; a NO_DETECTION / OCR_FAILED result on an ordinary scene is
the correct outcome, and any DETECTED result on such a scene is a live
false positive and is reported as one.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import cv2

from app import config
from app.camera.base import CameraSourceError, FrameReadError
from app.camera.factory import create_camera_source
from app.pipeline.ocr import get_ocr_engine
from app.pipeline.service import process_image
from evaluation.metrics import latency_summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument("--frames", type=int, default=30)
    parser.add_argument("--out", default=os.path.join(here, "results"))
    parser.add_argument("--label", default="", help="free-text device label for the report (e.g. from Device Manager)")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    get_ocr_engine()
    source = create_camera_source()
    described = None
    t = time.perf_counter()
    try:
        source.open()
    except CameraSourceError as exc:
        print(f"FAILED to open source: {exc}")
        return 1
    open_ms = (time.perf_counter() - t) * 1000
    described = source.describe()
    print(f"opened {described} in {open_ms:.0f} ms")

    read_ms: list[float] = []
    infer_ms: list[float] = []
    encode_ms: list[float] = []
    statuses: dict[str, int] = {}
    detections: list[dict] = []
    read_failures = 0
    frame_shape = None
    try:
        for i in range(args.frames):
            t = time.perf_counter()
            try:
                frame = source.read_frame()
            except FrameReadError:
                read_failures += 1
                continue
            read_ms.append((time.perf_counter() - t) * 1000)
            frame_shape = list(frame.shape)
            t = time.perf_counter()
            ok, buf = cv2.imencode(".jpg", frame)  # same encoding the runtime/CLI use
            encode_ms.append((time.perf_counter() - t) * 1000)
            if not ok:
                continue
            t = time.perf_counter()
            result = process_image(buf.tobytes())
            infer_ms.append((time.perf_counter() - t) * 1000)
            statuses[result.status.value] = statuses.get(result.status.value, 0) + 1
            if result.status.value == "DETECTED":
                detections.append(
                    {
                        "frame": i,
                        "normalized_plate": result.normalized_plate,
                        "ocr_confidence": result.ocr_confidence,
                        "detection_confidence": result.detection_confidence,
                    }
                )
            if i == 0:
                print(f"first frame {frame.shape} read {read_ms[-1]:.0f} ms, inference {infer_ms[-1]:.0f} ms, status {result.status.value}")
    finally:
        source.close()

    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "device_label": args.label,
        "source": {**described, "env": {"CAMERA_SOURCE": config.CAMERA_SOURCE, "CAMERA_DEVICE_INDEX": config.CAMERA_DEVICE_INDEX}},
        "open_ms": open_ms,
        "frames_requested": args.frames,
        "frames_read": len(read_ms),
        "read_failures": read_failures,
        "frame_shape": frame_shape,
        "read_latency": latency_summary(read_ms),
        "jpeg_encode_latency": latency_summary(encode_ms),
        "inference_latency": latency_summary(infer_ms),
        "status_counts": statuses,
        "detections": detections,
        "note": "no plate was presented to the camera; DETECTED entries are live false positives on an ordinary scene",
    }
    label = (args.label or f"{config.CAMERA_SOURCE}-{config.CAMERA_DEVICE_INDEX}").replace(" ", "_").replace("/", "_")
    path = os.path.join(args.out, f"camera_probe_{label}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(json.dumps({k: v for k, v in results.items() if k != "detections"}, indent=2))
    print(f"detections: {len(detections)}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
