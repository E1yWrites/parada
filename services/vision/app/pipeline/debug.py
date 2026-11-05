"""Optional debug dump (VISION_DEBUG_DIR): for each frame with plate candidates,
save the crops handed to OCR and what OCR read, so a live camera's readings
can be inspected. Writing is best-effort and never affects the result.
"""

import itertools
import logging
import os
import shutil
from datetime import datetime

import cv2
import numpy as np

from .ocr import OcrResult

logger = logging.getLogger("parada.vision.debug")

_frame_counter = itertools.count(1)


def _keep_frames() -> int:
    """VISION_DEBUG_KEEP: newest frame folders kept per debug folder (default 200; 0 = keep all)."""
    try:
        return max(0, int(os.environ.get("VISION_DEBUG_KEEP", "200")))
    except ValueError:
        return 200


class FrameDebug:
    def __init__(self, folder: str) -> None:
        self.folder = folder
        self._crops: list[tuple[str, np.ndarray]] = []
        self._lines: list[str] = []

    def crop(self, name: str, image: np.ndarray) -> None:
        self._crops.append((name, image))

    def frame(self, image: np.ndarray, max_width: int = 960) -> None:
        """The whole frame the camera saw, downscaled, to check framing/focus."""
        h, w = image.shape[:2]
        if w > max_width:
            image = cv2.resize(image, (max_width, int(h * max_width / w)), interpolation=cv2.INTER_AREA)
        self._crops.append(("frame", image))

    def note(self, line: str) -> None:
        self._lines.append(line)

    def ocr(self, name: str, result: OcrResult | None) -> None:
        if result is None:
            self.note(f"  {name}: ocr found no text")
            return
        self.note(f"  {name}: text='{result.text}' conf={result.confidence:.2f}")
        for f in result.fragments:
            mark = "kept" if f.kept else "dropped"
            self.note(f"      fragment '{f.text}' conf={f.confidence:.2f} height={f.height:.0f} {mark}")

    def save(self) -> None:
        try:
            os.makedirs(self.folder, exist_ok=True)
            for name, image in self._crops:
                cv2.imwrite(os.path.join(self.folder, f"{name}.png"), image)
            with open(os.path.join(self.folder, "ocr.txt"), "w", encoding="utf-8") as fh:
                fh.write("\n".join(self._lines) + "\n")
        except (OSError, cv2.error) as exc:
            logger.warning("could not write vision debug output to %s: %s", self.folder, exc)
            return
        # Bounded: a long camera run would otherwise fill the disk (~0.7 MB/frame).
        prune(os.path.dirname(self.folder), _keep_frames())


def prune(root: str, keep: int) -> None:
    """Delete the oldest frame folders under root so at most `keep` remain.
    Frame folders are named by timestamp, so name order is age order."""
    if keep <= 0:
        return
    try:
        # Only frame folders ("20261105-160413-..."), never anything else in root.
        folders = sorted(e.path for e in os.scandir(root) if e.is_dir() and e.name[:8].isdigit())
    except OSError:
        return
    for old in folders[: max(0, len(folders) - keep)]:
        shutil.rmtree(old, ignore_errors=True)


def start_frame(root: str) -> FrameDebug | None:
    """A FrameDebug for one frame under root, or None when debugging is off."""
    if not root:
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    return FrameDebug(os.path.join(root, f"{stamp}-p{os.getpid()}-{next(_frame_counter):06d}"))
