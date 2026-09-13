"""Phase 14 evaluation dataset — project-owned, programmatically generated.

Why synthetic: the repository holds no real vehicle photographs (none were
collected under a usage permission), and the Phase 11 fixtures are drawn
programmatically for the same reason. This generator extends that approach
into a *controlled* dataset: every image is a plate of KNOWN text rendered
into a scene and then degraded by exactly one named condition, so accuracy
can be attributed to lighting / angle / distance / blur / occlusion / noise.

Ground truth is established INDEPENDENTLY of the model: the plate text is
drawn from a seeded RNG, written into ``manifest.json`` here, and the
evaluation script only reads that file. Nothing in this module runs OCR.

Deterministic: same seed => byte-identical manifest and images (PNG, OpenCV
encoder), so the dataset can be regenerated instead of committed.

    python -m evaluation.dataset [--out evaluation/dataset] [--plates 50] [--seed 20260914]
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import sys
from dataclasses import asdict, dataclass

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FRAME_W, FRAME_H = 800, 600
# Base plate size in the 800x600 frame. Chosen inside the classical detector's
# operating envelope (its fixed 25x7 closing kernel must bridge the gap between
# the letter and digit groups); the "distance" conditions scale from here and
# the report shows where the envelope ends.
PLATE_W, PLATE_H = 200, 66
BG = (120, 120, 130)  # BGR-ish neutral grey, same family as the Phase 11 fixtures
DEFAULT_SEED = 20260914
DEFAULT_PLATES = 50
NEGATIVES = 100

# Bold sans-serif fonts, first one present wins. Recorded in the manifest so
# the rendering is reproducible on another machine.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/verdanab.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
DIGITS = "0123456789"


def _find_font() -> str | None:
    for path in FONT_CANDIDATES:
        if os.path.isfile(path):
            return path
    return None


# Real plates are printed in a fixed-pitch typeface whose characters span most
# of the plate width. Rendering is auto-fitted so every plate text fills the
# same fraction of the plate regardless of glyph widths (III vs WWW).
TEXT_FILL = 0.85  # fraction of plate width the text spans
TEXT_MAX_HEIGHT = 0.62  # fraction of plate height


def _fit_font(text: str, font_path: str | None, w: int, h: int, fill: float):
    """Largest font size whose rendered text fits within fill*w and
    TEXT_MAX_HEIGHT*h. Falls back to PIL's bitmap font when no TrueType font
    is available (recorded in the manifest; expect poor results there)."""
    if font_path is None:
        return ImageFont.load_default()
    probe = ImageDraw.Draw(Image.new("RGB", (4, 4)))
    best = ImageFont.truetype(font_path, 8)
    for size in range(8, 200):
        font = ImageFont.truetype(font_path, size)
        bbox = probe.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] > fill * w or bbox[3] - bbox[1] > TEXT_MAX_HEIGHT * h:
            break
        best = font
    return best


@dataclass(frozen=True)
class Condition:
    name: str
    group: str  # clean | lighting | angle | distance | blur | occlusion | noise
    params: dict


# Every positive plate is rendered once per condition. Parameters are the
# physical degradation, applied in `render_positive`.
CONDITIONS: list[Condition] = [
    Condition("clean", "clean", {}),
    Condition("light_dark_035", "lighting", {"gain": 0.35}),
    Condition("light_dark_020", "lighting", {"gain": 0.20}),
    Condition("light_bright_160", "lighting", {"gain": 1.60}),
    Condition("light_uneven", "lighting", {"gradient": [0.30, 1.00]}),
    Condition("angle_rot_05", "angle", {"rotation_deg": 5}),
    Condition("angle_rot_12", "angle", {"rotation_deg": 12}),
    Condition("angle_rot_20", "angle", {"rotation_deg": 20}),
    Condition("angle_persp_25", "angle", {"perspective_deg": 25}),
    Condition("dist_far_075", "distance", {"scale": 0.75}),  # 150x50 px plate
    Condition("dist_far_050", "distance", {"scale": 0.50}),  # 100x33 px plate
    Condition("dist_near_150", "distance", {"scale": 1.50}),  # 300x100 px plate (Phase 11 fixture size)
    Condition("dist_near_200", "distance", {"scale": 2.00}),  # 400x133 px plate
    Condition("blur_gauss_3", "blur", {"gaussian_ksize": 3}),
    Condition("blur_gauss_7", "blur", {"gaussian_ksize": 7}),
    Condition("blur_gauss_11", "blur", {"gaussian_ksize": 11}),
    Condition("blur_motion_9", "blur", {"motion_ksize": 9}),
    Condition("occl_10", "occlusion", {"fraction": 0.10}),
    Condition("occl_25", "occlusion", {"fraction": 0.25}),
    Condition("occl_40", "occlusion", {"fraction": 0.40}),
    Condition("noise_sensor_15", "noise", {"gaussian_sigma": 15}),
    # Plate layout: text spanning less of the plate (smaller characters on the
    # same plate). Added after the smoke run showed the classical detector's
    # aspect-ratio band (1.5-6.0) rejects a 70%-fill text strip — kept as a
    # measured condition rather than silently changing the base render.
    Condition("layout_fill_070", "layout", {"fill": 0.70}),
    # No gap between the letter and digit groups (some plate designs).
    Condition("layout_nospace", "layout", {"nospace": True}),
]


def random_plate_text(rng: random.Random) -> str:
    """Philippine-style 3 letters + 4 digits, with a space (normalization
    strips it). Letters/digits are drawn uniformly so look-alike glyphs
    (O/0, I/1, B/8, S/5, Z/2) occur at their natural frequency."""
    return "".join(rng.choice(LETTERS) for _ in range(3)) + " " + "".join(rng.choice(DIGITS) for _ in range(4))


def normalize(text: str) -> str:
    # Same rule as app/pipeline/normalize.py (and packages/database plate.ts).
    return "".join(ch for ch in text.upper() if ch.isalnum())


def render_plate(text: str, font_path: str | None, w: int = PLATE_W, h: int = PLATE_H, fill: float = TEXT_FILL) -> np.ndarray:
    font = _fit_font(text, font_path, w, h, fill)
    img = Image.new("RGB", (w, h), color=(235, 235, 235))
    draw = ImageDraw.Draw(img)
    draw.rectangle([2, 2, w - 3, h - 3], outline=(20, 20, 20), width=4)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2 - bbox[0], (h - th) / 2 - bbox[1]), text, fill=(10, 10, 10), font=font)
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def _paste(scene: np.ndarray, patch: np.ndarray, x: int, y: int) -> None:
    h, w = patch.shape[:2]
    scene[y : y + h, x : x + w] = patch


def _rotate(patch: np.ndarray, deg: float) -> np.ndarray:
    h, w = patch.shape[:2]
    pad = int(0.35 * max(h, w))
    padded = cv2.copyMakeBorder(patch, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=BG)
    ph, pw = padded.shape[:2]
    m = cv2.getRotationMatrix2D((pw / 2, ph / 2), deg, 1.0)
    return cv2.warpAffine(padded, m, (pw, ph), borderValue=BG, flags=cv2.INTER_LINEAR)


def _perspective(patch: np.ndarray, deg: float) -> np.ndarray:
    """Horizontal viewing angle: the far (right) edge is foreshortened."""
    h, w = patch.shape[:2]
    pad = int(0.2 * h)
    padded = cv2.copyMakeBorder(patch, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=BG)
    ph, pw = padded.shape[:2]
    shrink = np.tan(np.radians(deg)) * pw * 0.35
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    dst = np.float32([[0, 0], [pw - shrink, shrink * 0.5], [pw - shrink, ph - shrink * 0.5], [0, ph]])
    m = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(padded, m, (pw, ph), borderValue=BG, flags=cv2.INTER_LINEAR)


def _motion_kernel(k: int) -> np.ndarray:
    kernel = np.zeros((k, k), dtype=np.float32)
    kernel[k // 2, :] = 1.0 / k
    return kernel


def render_positive(text: str, cond: Condition, rng: random.Random, font_path: str | None) -> tuple[np.ndarray, dict]:
    """Returns (image, placement) — placement is recorded, never used by OCR."""
    p = cond.params
    drawn = text.replace(" ", "") if p.get("nospace") else text
    plate = render_plate(drawn, font_path, fill=float(p.get("fill", TEXT_FILL)))

    if "scale" in p:
        s = float(p["scale"])
        plate = cv2.resize(plate, (int(PLATE_W * s), int(PLATE_H * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    if "rotation_deg" in p:
        plate = _rotate(plate, float(p["rotation_deg"]))
    if "perspective_deg" in p:
        plate = _perspective(plate, float(p["perspective_deg"]))
    if "fraction" in p:  # occlusion: a bg-coloured band over the plate's left or right part
        f = float(p["fraction"])
        h, w = plate.shape[:2]
        band = int(w * f)
        if rng.random() < 0.5:
            plate[:, :band] = BG
            side = "left"
        else:
            plate[:, w - band :] = BG
            side = "right"
        p = {**p, "side": side}

    scene = np.full((FRAME_H, FRAME_W, 3), BG, dtype=np.uint8)
    h, w = plate.shape[:2]
    x = rng.randint(40, FRAME_W - w - 40)
    y = rng.randint(40, FRAME_H - h - 40)
    _paste(scene, plate, x, y)

    if "gain" in p:
        scene = np.clip(scene.astype(np.float32) * float(p["gain"]), 0, 255).astype(np.uint8)
    if "gradient" in p:
        lo, hi = p["gradient"]
        ramp = np.linspace(lo, hi, FRAME_W, dtype=np.float32)[None, :, None]
        scene = np.clip(scene.astype(np.float32) * ramp, 0, 255).astype(np.uint8)
    if "gaussian_ksize" in p:
        k = int(p["gaussian_ksize"])
        scene = cv2.GaussianBlur(scene, (k, k), 0)
    if "motion_ksize" in p:
        scene = cv2.filter2D(scene, -1, _motion_kernel(int(p["motion_ksize"])))
    if "gaussian_sigma" in p:
        noise = np.random.default_rng(rng.randrange(2**31)).normal(0, float(p["gaussian_sigma"]), scene.shape)
        scene = np.clip(scene.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    return scene, {"x": x, "y": y, "w": int(w), "h": int(h), "params": p}


NEGATIVE_KINDS = ["plain", "blobs", "non_plate_rects", "textless_plate_rect", "textured"]


def render_negative(kind: str, rng: random.Random) -> np.ndarray:
    """Scenes with NO plate text. ``textless_plate_rect`` is deliberately a
    plate-shaped, plate-coloured rectangle with no characters: the detector
    should fire on it (it is plate-shaped) and OCR must then refuse to invent
    text — that is the OCR_FAILED path, not a false positive."""
    scene = Image.new("RGB", (FRAME_W, FRAME_H), color=(BG[2], BG[1], BG[0]))
    draw = ImageDraw.Draw(scene)
    if kind == "plain":
        pass
    elif kind == "blobs":
        for _ in range(rng.randint(2, 5)):
            x, y = rng.randint(0, FRAME_W - 200), rng.randint(0, FRAME_H - 150)
            g = rng.randint(70, 170)
            draw.ellipse([x, y, x + rng.randint(80, 200), y + rng.randint(60, 150)], fill=(g, g, g))
    elif kind == "non_plate_rects":
        for _ in range(rng.randint(2, 4)):
            w = rng.randint(60, 160)
            h = int(w * rng.uniform(0.8, 1.4))  # square-ish / tall: outside the plate aspect band
            x, y = rng.randint(0, FRAME_W - w - 1), rng.randint(0, FRAME_H - h - 1)
            g = rng.randint(60, 220)
            draw.rectangle([x, y, x + w, y + h], fill=(g, g, g), outline=(20, 20, 20), width=3)
    elif kind == "textless_plate_rect":
        x, y = rng.randint(40, FRAME_W - PLATE_W - 40), rng.randint(40, FRAME_H - PLATE_H - 40)
        draw.rectangle([x, y, x + PLATE_W, y + PLATE_H], fill=(235, 235, 235), outline=(20, 20, 20), width=4)
    elif kind == "textured":
        arr = np.random.default_rng(rng.randrange(2**31)).integers(90, 160, (FRAME_H, FRAME_W, 3), dtype=np.uint8)
        return cv2.GaussianBlur(arr, (7, 7), 0)
    else:
        raise ValueError(kind)
    return cv2.cvtColor(np.array(scene), cv2.COLOR_RGB2BGR)


def build(out_dir: str, plates: int = DEFAULT_PLATES, seed: int = DEFAULT_SEED) -> dict:
    images_dir = os.path.join(out_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    rng = random.Random(seed)
    font_path = _find_font()

    entries: list[dict] = []
    texts: list[str] = []
    seen: set[str] = set()
    while len(texts) < plates:
        t = random_plate_text(rng)
        if normalize(t) not in seen:
            seen.add(normalize(t))
            texts.append(t)

    for pi, text in enumerate(texts):
        for cond in CONDITIONS:
            img, placement = render_positive(text, cond, rng, font_path)
            image_id = f"p{pi:03d}_{cond.name}"
            fname = f"{image_id}.png"
            cv2.imwrite(os.path.join(images_dir, fname), img)
            entries.append(
                {
                    "id": image_id,
                    "file": f"images/{fname}",
                    "is_negative": False,
                    "plate_text": text,
                    "ground_truth": normalize(text),
                    "condition": cond.name,
                    "group": cond.group,
                    "placement": placement,
                }
            )

    for ni in range(NEGATIVES):
        kind = NEGATIVE_KINDS[ni % len(NEGATIVE_KINDS)]
        img = render_negative(kind, rng)
        image_id = f"n{ni:03d}_{kind}"
        fname = f"{image_id}.png"
        cv2.imwrite(os.path.join(images_dir, fname), img)
        entries.append(
            {
                "id": image_id,
                "file": f"images/{fname}",
                "is_negative": True,
                "plate_text": None,
                "ground_truth": None,
                "condition": f"negative_{kind}",
                "group": "negative",
                "placement": None,
            }
        )

    manifest = {
        "schema": "parada-vision-eval-manifest/1",
        "seed": seed,
        "generator": "services/vision/evaluation/dataset.py",
        "frame_size": [FRAME_W, FRAME_H],
        "plate_size": [PLATE_W, PLATE_H],
        "font": font_path or "PIL-default-bitmap",
        "text_fill": TEXT_FILL,
        "text_max_height": TEXT_MAX_HEIGHT,
        "unique_plates": plates,
        "conditions": [asdict(c) for c in CONDITIONS],
        "negative_kinds": NEGATIVE_KINDS,
        "counts": {"positives": plates * len(CONDITIONS), "negatives": NEGATIVES, "total": len(entries)},
        "render_runtime": {
            "python": platform.python_version(),
            "opencv": cv2.__version__,
            "pillow": Image.__version__ if hasattr(Image, "__version__") else "unknown",
            "platform": platform.platform(),
        },
        "images": entries,
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "dataset"))
    parser.add_argument("--plates", type=int, default=DEFAULT_PLATES)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args(argv)
    m = build(args.out, args.plates, args.seed)
    print(f"wrote {m['counts']['total']} images ({m['counts']['positives']} positive, {m['counts']['negatives']} negative) to {args.out}")
    print(f"font: {m['font']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
