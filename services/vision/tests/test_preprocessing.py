import cv2
import numpy as np
import pytest

from app.pipeline.preprocessing import decode_image, enhance_for_ocr, resize_if_needed


def test_decode_image_rejects_empty_bytes():
    with pytest.raises(ValueError):
        decode_image(b"")


def test_decode_image_rejects_corrupt_bytes():
    with pytest.raises(ValueError):
        decode_image(b"this is not an image")


def test_decode_image_accepts_real_png():
    img = np.zeros((10, 10, 3), dtype=np.uint8)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    decoded = decode_image(buf.tobytes())
    assert decoded.shape == (10, 10, 3)


def test_resize_leaves_small_image_unchanged():
    img = np.zeros((100, 200, 3), dtype=np.uint8)
    out = resize_if_needed(img, max_dim=1600)
    assert out.shape == img.shape


def test_resize_shrinks_large_image():
    img = np.zeros((2000, 4000, 3), dtype=np.uint8)
    out = resize_if_needed(img, max_dim=1600)
    assert max(out.shape[:2]) == 1600


def test_enhance_for_ocr_returns_grayscale():
    crop = np.full((50, 150, 3), 128, dtype=np.uint8)
    out = enhance_for_ocr(crop)
    assert out.ndim == 2
    assert out.shape == (50, 150)
