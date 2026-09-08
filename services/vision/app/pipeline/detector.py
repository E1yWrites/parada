"""Classical (non-DL) license-plate region detector.

Real computer vision, not a placeholder: blackhat morphology to isolate dark
text-like regions from their surroundings, a Scharr gradient + Otsu threshold
to build a binary mask of candidate strips, then contour filtering by the
aspect ratio a plate actually has. No model weights, no network access, no
GPU — this is the standard classical ANPR candidate-region approach, and it
means detection has zero dependency on whether an ML runtime is available.

DETECTION confidence here is a heuristic score derived from how closely each
candidate's shape matches a real plate (aspect ratio + rectangle fill), not
an OCR confidence. It answers "does this look like a plate region", separate
from "what does the OCR engine think it read" (see ocr.py).
"""

from dataclasses import dataclass

import cv2
import numpy as np

MIN_ASPECT_RATIO = 1.5
MAX_ASPECT_RATIO = 6.0
IDEAL_ASPECT_RATIO = 3.2
MIN_AREA_FRACTION = 0.001  # candidate must cover at least this fraction of the frame
MAX_AREA_FRACTION = 0.35


@dataclass(frozen=True)
class PlateCandidate:
    x: int
    y: int
    w: int
    h: int
    detection_confidence: float

    def crop(self, image: np.ndarray) -> np.ndarray:
        return image[self.y : self.y + self.h, self.x : self.x + self.w]


def _rect_kernel(w: int, h: int) -> np.ndarray:
    return cv2.getStructuringElement(cv2.MORPH_RECT, (w, h))


def detect_plate_candidates(image: np.ndarray, max_candidates: int = 5) -> list[PlateCandidate]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    frame_area = gray.shape[0] * gray.shape[1]

    rect_kernel = _rect_kernel(25, 7)
    square_kernel = _rect_kernel(3, 3)

    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, rect_kernel)

    grad_x = cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=-1)
    grad_x = np.absolute(grad_x)
    min_val, max_val = float(grad_x.min()), float(grad_x.max())
    grad_x = 255 * ((grad_x - min_val) / (max_val - min_val + 1e-6))
    grad_x = grad_x.astype("uint8")

    grad_x = cv2.GaussianBlur(grad_x, (5, 5), 0)
    grad_x = cv2.morphologyEx(grad_x, cv2.MORPH_CLOSE, rect_kernel)
    thresh = cv2.threshold(grad_x, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]

    thresh = cv2.erode(thresh, square_kernel, iterations=2)
    thresh = cv2.dilate(thresh, square_kernel, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates: list[PlateCandidate] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if h == 0:
            continue
        aspect_ratio = w / float(h)
        area_fraction = (w * h) / float(frame_area)
        if not (MIN_ASPECT_RATIO <= aspect_ratio <= MAX_ASPECT_RATIO):
            continue
        if not (MIN_AREA_FRACTION <= area_fraction <= MAX_AREA_FRACTION):
            continue

        contour_area = cv2.contourArea(contour)
        rect_area = float(w * h)
        fill_ratio = contour_area / rect_area if rect_area > 0 else 0.0
        aspect_score = 1.0 - min(abs(aspect_ratio - IDEAL_ASPECT_RATIO) / IDEAL_ASPECT_RATIO, 1.0)
        confidence = max(0.0, min(1.0, 0.6 * aspect_score + 0.4 * fill_ratio))

        candidates.append(PlateCandidate(x=x, y=y, w=w, h=h, detection_confidence=confidence))

    candidates.sort(key=lambda c: c.detection_confidence, reverse=True)
    return candidates[:max_candidates]
