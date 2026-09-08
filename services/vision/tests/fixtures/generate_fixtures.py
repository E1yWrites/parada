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
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
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
    scene = make_clear()
    noise = np.random.default_rng(42).normal(0, 60, scene.shape).astype(np.int16)
    noisy = np.clip(scene.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return cv2.GaussianBlur(noisy, (25, 25), 0)


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
