"""Real OCR engine wrapper around EasyOCR (CRAFT detector + CRNN recognizer,
Apache-2.0, https://github.com/JaidedAI/EasyOCR). Chosen over Tesseract
because this sandbox has no apt/sudo access to install the tesseract system
binary (pytesseract needs it); EasyOCR is pip-installable and self-contained.
See services/vision/README.md for the full model-selection rationale.

The model is loaded exactly once per process (see get_ocr_engine) — reader
construction downloads/loads network weights and is expensive to repeat per
request.
"""

import re
from dataclasses import dataclass, replace
from functools import lru_cache

import easyocr
import numpy as np

# Fragments shorter than this fraction of the tallest fragment are small print
# (region "NCR", dealer stickers, slogans), not the plate number.
MIN_FRAGMENT_HEIGHT_RATIO = 0.5

# No EasyOCR allowlist on purpose: with allowlist=A-Z0-9 the I's single stroke
# came out as "L" and spaces were dropped, so "CD [ 6227" became the wrong plate
# "CDL6227" (8 of 58 real day-test frames, none improved). match_plate reads
# "[", "]" and "|" after letters as I instead.

# Region/sticker words printed on Philippine plates around the plate number.
REGION_WORDS = frozenset({"NCR", "PILIPINAS", "PHILIPPINES", "LTO"})
# "REGION4A", "REGIONIV", "REGION" (its number then follows as its own token).
_REGION_TOKEN = re.compile(r"^REGION[0-9IVX]*[AB]?$")
_REGION_NUMBER = re.compile(r"^[0-9IVX]{1,4}[AB]?$")


@dataclass(frozen=True)
class OcrFragment:
    text: str
    confidence: float
    x: float  # left edge
    top: float
    bottom: float
    kept: bool = False  # part of the plate-number line that was read

    @property
    def height(self) -> float:
        return self.bottom - self.top

    @property
    def center_y(self) -> float:
        return (self.top + self.bottom) / 2


@dataclass(frozen=True)
class OcrResult:
    text: str
    confidence: float  # real per-result confidence from the recognition network, [0..1]
    # Every fragment the engine returned, kept or not (debug output only).
    fragments: tuple[OcrFragment, ...] = ()


@lru_cache(maxsize=1)
def get_ocr_engine() -> "easyocr.Reader":
    # gpu=False: keep behavior deterministic and portable; CUDA is used
    # automatically by the underlying torch ops when available on the host,
    # but we don't require it (see README "Hardware").
    return easyocr.Reader(["en"], gpu=False, verbose=False)


def _token_key(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def is_region_word(text: str) -> bool:
    key = _token_key(text)
    return key in REGION_WORDS or bool(_REGION_TOKEN.match(key))


def strip_region_words(text: str) -> str:
    """Drop region/sticker tokens from a reading ("NCR ABC 1234" -> "ABC 1234").
    A bare "REGION" also takes the region number after it ("REGION IV-A")."""
    kept: list[str] = []
    after_region = False
    for token in text.split():
        key = _token_key(token)
        if after_region and _REGION_NUMBER.match(key):
            after_region = False
            continue
        after_region = key == "REGION"
        if is_region_word(token):
            continue
        kept.append(token)
    return " ".join(kept)


def _to_fragment(result) -> OcrFragment:
    box, text, confidence = result[0], str(result[1]), float(result[2])
    xs = [float(p[0]) for p in box]
    ys = [float(p[1]) for p in box]
    return OcrFragment(text=text, confidence=confidence, x=min(xs), top=min(ys), bottom=max(ys))


def select_plate_line(fragments: list[OcrFragment]) -> list[OcrFragment]:
    """The fragments of the plate-number line, left to right.

    Plates carry small text above/below the number (region, slogans). Region
    words are dropped, then fragments much shorter than the tallest one; the
    rest is grouped into lines by vertical position and the line with the
    tallest characters (the plate number) is returned.
    """
    candidates = [f for f in fragments if not is_region_word(f.text) and f.height > 0]
    if not candidates:
        return []
    tallest = max(f.height for f in candidates)
    candidates = [f for f in candidates if f.height >= MIN_FRAGMENT_HEIGHT_RATIO * tallest]

    lines = group_lines(candidates)
    best = max(lines, key=lambda line: (max(f.height for f in line), len(line)))
    return sorted(best, key=lambda f: f.x)


def group_lines(fragments: list[OcrFragment]) -> list[list[OcrFragment]]:
    """Group fragments into text lines, top to bottom; a fragment joins a line
    when its center sits within half a character height of the line's center."""
    lines: list[list[OcrFragment]] = []
    for fragment in sorted(fragments, key=lambda f: f.center_y):
        if lines:
            line = lines[-1]
            line_center = sum(f.center_y for f in line) / len(line)
            line_height = max(f.height for f in line)
            if abs(fragment.center_y - line_center) <= 0.5 * max(fragment.height, line_height):
                line.append(fragment)
                continue
        lines.append([fragment])
    return lines


def read_plate_text(crop: np.ndarray) -> OcrResult | None:
    """Run OCR on an already-cropped plate region. Returns None if the engine
    found no text at all, and an empty-text result if it only found small print
    or region words (never fabricates a result).
    """
    reader = get_ocr_engine()
    results = reader.readtext(crop, detail=1, paragraph=False)
    if not results:
        return None

    fragments = [_to_fragment(r) for r in results]
    line = select_plate_line(fragments)
    text = strip_region_words(" ".join(f.text for f in line))
    kept_ids = {id(f) for f in line}
    fragments_out = tuple(
        replace(f, kept=id(f) in kept_ids) for f in sorted(fragments, key=lambda f: (f.center_y, f.x))
    )
    if not text:
        # Only small print / region words: nothing to report, but keep what
        # was seen for the debug output.
        return OcrResult(text="", confidence=0.0, fragments=fragments_out)

    # Mean confidence over the plate-number line only, so a low-confidence
    # read of the small region text no longer drags the plate's score down.
    confidence = sum(f.confidence for f in line) / len(line)
    return OcrResult(text=text, confidence=confidence, fragments=fragments_out)


def read_text_lines(image: np.ndarray) -> list[OcrResult]:
    """Run EasyOCR's own text detector over a whole frame and return every text
    line it finds (region/sticker words removed), tallest characters first.

    Used when the classical plate detector boxes nothing readable: on real
    camera scenes it often boxes faces, edges and clutter while missing the
    plate, whereas EasyOCR's CRAFT detector is built to find text anywhere.
    """
    reader = get_ocr_engine()
    results = reader.readtext(image, detail=1, paragraph=False)
    if not results:
        return []
    fragments = [_to_fragment(r) for r in results if not is_region_word(str(r[1]))]
    out: list[OcrResult] = []
    for line in group_lines([f for f in fragments if f.height > 0]):
        line = sorted(line, key=lambda f: f.x)
        text = strip_region_words(" ".join(f.text for f in line))
        if not text:
            continue
        confidence = sum(f.confidence for f in line) / len(line)
        out.append(OcrResult(text=text, confidence=confidence, fragments=tuple(replace(f, kept=True) for f in line)))
    out.sort(key=lambda r: -max(f.height for f in r.fragments))
    return out
