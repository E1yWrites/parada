"""Real OCR engine wrapper around EasyOCR (CRAFT detector + CRNN recognizer,
Apache-2.0, https://github.com/JaidedAI/EasyOCR). Chosen over Tesseract
because this sandbox has no apt/sudo access to install the tesseract system
binary (pytesseract needs it); EasyOCR is pip-installable and self-contained.
See services/vision/README.md for the full model-selection rationale.

The model is loaded exactly once per process (see get_ocr_engine) — reader
construction downloads/loads network weights and is expensive to repeat per
request.
"""

from dataclasses import dataclass
from functools import lru_cache

import easyocr
import numpy as np


@dataclass(frozen=True)
class OcrResult:
    text: str
    confidence: float  # real per-result confidence from the recognition network, [0..1]


@lru_cache(maxsize=1)
def get_ocr_engine() -> "easyocr.Reader":
    # gpu=False: keep behavior deterministic and portable; CUDA is used
    # automatically by the underlying torch ops when available on the host,
    # but we don't require it (see README "Hardware").
    return easyocr.Reader(["en"], gpu=False, verbose=False)


def read_plate_text(crop: np.ndarray) -> OcrResult | None:
    """Run OCR on an already-cropped plate region. Returns None if the engine
    found no readable text at all (never fabricates a result).
    """
    reader = get_ocr_engine()
    results = reader.readtext(crop, detail=1, paragraph=False)
    if not results:
        return None

    # Multiple text fragments can appear in one crop (state name, stacked
    # lines). Concatenate in left-to-right reading order rather than
    # arbitrarily picking one fragment, and use the mean confidence across
    # fragments as the plate's OCR confidence — a documented, deterministic
    # aggregation, not a guess.
    results.sort(key=lambda r: r[0][0][0])  # sort by top-left x of each box
    text = " ".join(str(r[1]) for r in results)
    confidence = sum(float(r[2]) for r in results) / len(results)
    return OcrResult(text=text, confidence=confidence)
