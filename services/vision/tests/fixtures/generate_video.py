"""Generates a short synthetic video fixture from the project plate images, so
the video-file camera source (Phase 11C) can be exercised deterministically
with no hardware. Contains no real vehicle footage or copyrighted material —
the frames are the same synthetic PNGs the image tests already use.

Run once: `python tests/fixtures/generate_video.py`
"""

import os
import sys

import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_fixtures import FIXTURES  # noqa: E402

VIDEO_DIR = os.path.join(os.path.dirname(__file__), "videos")
VIDEO_PATH = os.path.join(VIDEO_DIR, "clear_plate.mp4")


def generate_video(path: str = VIDEO_PATH, fps: int = 10, seconds: float = 1.0) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # The clear plate is 800x600 at 300x100 plate region centered near (250,250).
    first = FIXTURES["clear_plate.png"]()
    h, w = first.shape[:2]
    n_frames = max(1, int(fps * seconds))

    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        # Fall back to avi if the mp4v codec is unavailable in this build.
        writer = cv2.VideoWriter(path.replace(".mp4", ".avi"), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
        path = path.replace(".mp4", ".avi")
    try:
        # Alternate between a clear plate frame and a no-plate frame so the
        # source genuinely yields distinguishable frames across the clip.
        for i in range(n_frames):
            frame = FIXTURES["clear_plate.png"]() if i % 2 == 0 else FIXTURES["no_plate.png"]()
            writer.write(frame)
    finally:
        writer.release()
    return path


if __name__ == "__main__":
    p = generate_video()
    print("wrote", p)
