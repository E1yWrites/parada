import cv2
import numpy as np

MAX_DIMENSION = 1600


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode raw bytes into a BGR image. Raises ValueError on invalid/corrupt input."""
    if not image_bytes:
        raise ValueError("empty image payload")
    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError("could not decode image (corrupt or unsupported format)")
    return image


def resize_if_needed(image: np.ndarray, max_dim: int = MAX_DIMENSION) -> np.ndarray:
    """Downscale large camera frames for bounded inference latency/memory. Upscaling
    tiny inputs is skipped — it does not add real detail and just costs more compute.
    """
    h, w = image.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return image
    scale = max_dim / longest
    return cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def enhance_for_ocr(crop: np.ndarray) -> np.ndarray:
    """Grayscale + CLAHE contrast normalization on a plate crop. Improves OCR
    robustness under uneven lighting/glare without over-processing (no blind
    denoise/threshold — those tend to destroy thin plate character strokes).
    """
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)
