"""Generates a small set of synthetic, project-owned plate images for tests.

These are NOT real vehicle photos and contain no copyrighted material — they
are drawn programmatically (PIL/OpenCV) so the fixture set can be committed
without any licensing concern (section 43 forbids copyrighted datasets).
Run once: `python tests/fixtures/generate_fixtures.py`.
"""

import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), "images")


def _plate_image(text: str, w: int = 300, h: int = 100) -> Image.Image:
    img = Image.new("RGB", (w, h), color=(235, 235, 235))
    draw = ImageDraw.Draw(img)
    draw.rectangle([2, 2, w - 3, h - 3], outline=(20, 20, 20), width=4)
    font = ImageFont.load_default()
    # DejaVu (Linux, used for the committed fixtures) first; Arial Bold so a
    # Windows checkout also draws plate-size text instead of the tiny default font.
    for name in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf", "arialbd.ttf"):
        try:
            font = ImageFont.truetype(name, 48)
            break
        except OSError:
            continue
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2 - bbox[0], (h - th) / 2 - bbox[1]), text, fill=(10, 10, 10), font=font)
    return img


def _scene(plate_positions: list[tuple[Image.Image, tuple[int, int]]], size=(800, 600), bg=(120, 120, 130)) -> np.ndarray:
    scene = Image.new("RGB", size, color=bg)
    for plate_img, pos in plate_positions:
        scene.paste(plate_img, pos)
    return cv2.cvtColor(np.array(scene), cv2.COLOR_RGB2BGR)


def make_clear():
    plate = _plate_image("ABC1234")
    return _scene([(plate, (250, 250))])


def make_angled():
    plate = np.array(_plate_image("ABC1234"))
    plate = cv2.cvtColor(plate, cv2.COLOR_RGB2BGR)
    h, w = plate.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), 12, 1.0)
    rotated = cv2.warpAffine(plate, matrix, (w, h), borderValue=(120, 120, 130))
    scene = np.full((600, 800, 3), (120, 120, 130), dtype=np.uint8)
    scene[250 : 250 + h, 250 : 250 + w] = rotated
    return scene


def make_low_light():
    scene = make_clear()
    return (scene.astype(np.float32) * 0.35).astype(np.uint8)


def make_spaced():
    plate = _plate_image("ABC 1234")
    return _scene([(plate, (250, 250))])


def make_unreadable():
    # A plate-shaped box whose text is pixelated into blocks wider than a
    # character, so no text survives (for people or OCR). The previous version
    # (noise + blur over the whole scene) left "ABC1234" legible; it only beat
    # the box detector, and full-frame OCR then read the real text.
    scene = make_clear()
    inner = scene[262:338, 262:538]  # inside the plate border (plate at 250,250, 300x100)
    ys, xs = np.nonzero(cv2.cvtColor(inner, cv2.COLOR_BGR2GRAY) < 100)
    # Text bounding box, padded to take in the anti-aliased edges.
    y0, y1 = max(0, ys.min() - 3), min(inner.shape[0], ys.max() + 4)
    x0, x1 = max(0, xs.min() - 3), min(inner.shape[1], xs.max() + 4)
    text = inner[y0:y1, x0:x1]
    # One block row over the full text height, each block one text-height wide
    # (wider than any character): every character collapses to a gray block.
    size = y1 - y0
    blocks = cv2.resize(text, (max(1, (x1 - x0) // size), 1), interpolation=cv2.INTER_AREA)
    inner[y0:y1, x0:x1] = cv2.resize(blocks, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    return scene


def make_no_plate():
    scene = Image.new("RGB", (800, 600), color=(120, 130, 120))
    draw = ImageDraw.Draw(scene)
    # a few soft irregular blobs — nothing plate-shaped, no straight rectangle
    draw.ellipse([100, 400, 300, 480], fill=(90, 90, 90))
    draw.ellipse([500, 150, 620, 260], fill=(150, 150, 160))
    return cv2.cvtColor(np.array(scene), cv2.COLOR_RGB2BGR)


def make_multiple():
    strong = _plate_image("ABC1234")
    weak = _plate_image("XYZ9999", w=180, h=60)
    return _scene([(strong, (250, 380)), (weak, (80, 60))])


FIXTURES = {
    "clear_plate.png": make_clear,
    "angled_plate.png": make_angled,
    "low_light_plate.png": make_low_light,
    "spaced_plate.png": make_spaced,
    "unreadable_plate.png": make_unreadable,
    "no_plate.png": make_no_plate,
    "multiple_plates.png": make_multiple,
}


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, factory in FIXTURES.items():
        image = factory()
        cv2.imwrite(os.path.join(OUT_DIR, name), image)
        print(f"wrote {name}")


if __name__ == "__main__":
    main()
