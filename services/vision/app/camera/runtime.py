"""Runtime connecting a physical source to the shared vision pipeline and
forwarding normalized events to the existing API.

Responsibilities (and only these):
- open the configured source, read frames at a capped rate
- run the SHARED pipeline (process_image) per processed frame
- debounce duplicate observations (same camera + same plate + same direction)
- forward normalized events through app.api_client (the sole downstream call)
- isolate per-source failures and reconnect with bounded backoff
- shut down cleanly: release OpenCV captures, stop the loop

Domain decisions (zone, capacity, sessions, fees, violations, notifications,
guest policy) are NEVER made here — the API remains authoritative.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import cv2
import httpx
import numpy as np

from .. import api_client, config
from ..event_identity import make_source_event_id
from ..pipeline.service import DetectionStatus, process_image
from .base import CameraSource, CameraSourceError, FrameReadError

logger = logging.getLogger("parada.vision.runtime")


@dataclass
class RuntimeStats:
    frames_read: int = 0
    frames_processed: int = 0
    detections: int = 0
    forwarded: int = 0
    api_ok: int = 0
    api_conflict: int = 0
    api_throttled: int = 0
    api_error: int = 0
    api_retries: int = 0
    read_failures: int = 0
    reconnects: int = 0
    consecutive_read_failures: int = 0
    last_event: dict | None = None


@dataclass
class CameraRuntime:
    """Owns a CameraSource and drives the frame->OCR->API loop."""

    source: CameraSource
    camera_identifier: str
    zone_id: str | None = None
    process_fps: float = field(default_factory=lambda: config.VISION_PROCESS_FPS)
    cooldown_seconds: float = field(default_factory=lambda: config.OBSERVATION_COOLDOWN_SECONDS)
    reconnect_delay: float = field(default_factory=lambda: config.CAMERA_RECONNECT_DELAY_SECONDS)
    max_consecutive_failures: int = field(default_factory=lambda: config.MAX_CONSECUTIVE_READ_FAILURES)
    max_reconnects: int = field(default_factory=lambda: config.MAX_CAMERA_RECONNECTS)
    max_forward_attempts: int = field(default_factory=lambda: config.MAX_FORWARD_ATTEMPTS)
    event_type: str = "ENTRY"  # fixed for a single-camera runtime; the API enforces direction

    def __post_init__(self) -> None:
        # The only ingestion contract the API exposes is
        # POST /zones/:zoneId/events — the zone is part of the URL, so a runtime
        # without one would post every event to "/zones/None/events" and be
        # rejected with 404 forever. Refuse to construct instead.
        if not self.zone_id:
            raise ValueError(
                "zone_id is required: the API ingests camera events at "
                "POST /zones/:zoneId/events. Set CAMERA_ZONE_ID (or pass --zone-id) "
                f"to the zone that camera '{self.camera_identifier}' is configured under."
            )
        if self.process_fps <= 0:
            self.process_fps = 1.0
        self._stop_flag = False
        self.stats = RuntimeStats()
        self._last_observations: dict[tuple[str, str, str], float] = {}

    def _source_name(self) -> str:
        """Source type as a plain string; sources may expose enum or str."""
        value = getattr(self.source, "source_type", None)
        if value is None:
            return "unknown"
        return value.value if hasattr(value, "value") else str(value)

    # ------------------------------------------------------------------ API

    def _forward(self, event: dict) -> str:
        """Send one normalized event to the API. Returns a short outcome label.

        The debounce timestamp for this plate is already recorded by the time
        this runs, so if the event is lost here the car is invisible for the
        whole cooldown window and is simply never counted. The only recovery
        that is also safe is to re-send THIS event object: its sourceEventId is
        unchanged, so if the API committed the first attempt and only the
        response was lost, the unique constraint on (cameraId, sourceEventId)
        answers 409 and nothing is counted twice. Re-sending via the next frame
        would not have that property — a live camera yields new bytes and a new
        id every frame — which is why the cooldown is not moved instead.

        - 201: accepted.
        - 409: a BUSINESS answer (duplicate/full/direction/offline). Final —
          never retried; the camera keeps going.
        - 429 / 5xx / transport (down, DNS, timeout): retried up to
          max_forward_attempts in total, backing off reconnect_delay between
          attempts. One event in flight at a time, no queue, so the cost is
          bounded and there is no storm against a struggling API.
        - Other 4xx (auth/validation): deterministic, so retrying is waste.
          Final on the first answer. 429 is never treated as an auth failure
          (no credential change, no new token).
        """
        attempts = max(1, self.max_forward_attempts)
        outcome = "error:unknown"
        for attempt in range(1, attempts + 1):
            outcome, retryable = self._forward_once(event, attempt)
            if not retryable:
                return outcome
            # Back off after every retryable failure, including the last one, so
            # a sustained outage never has the loop hammering at frame rate.
            if self._wait_interruptible(self.reconnect_delay):
                return outcome
            if attempt < attempts:
                self.stats.api_retries += 1
        return outcome

    def _forward_once(self, event: dict, attempt: int) -> tuple[str, bool]:
        """One HTTP attempt. Returns (outcome label, retryable)."""
        try:
            status_code, body = api_client.forward_event(self.zone_id, event)
        except (httpx.HTTPError, OSError) as exc:
            self.stats.api_error += 1
            logger.warning(
                "api unreachable (%s) attempt=%d camera=%s",
                type(exc).__name__,
                attempt,
                self.camera_identifier,
            )
            return "error:transport", True
        if status_code == 201:
            self.stats.api_ok += 1
            return "ok", False
        if status_code == 409:
            # Duplicate sourceEventId, full zone, offline camera, or wrong
            # direction — a clean domain rejection, not a vision failure.
            self.stats.api_conflict += 1
            reason = self._reason_from_body(body)
            logger.info("api rejected event status=409 reason=%s camera=%s", reason, self.camera_identifier)
            return f"conflict:{reason}", False
        if status_code == 429:
            self.stats.api_throttled += 1
            logger.warning(
                "api throttled event (429) attempt=%d camera=%s", attempt, self.camera_identifier
            )
            return "throttled", True
        self.stats.api_error += 1
        retryable = status_code >= 500
        logger.warning(
            "api event error status=%s attempt=%d camera=%s (%s)",
            status_code,
            attempt,
            self.camera_identifier,
            "will retry" if retryable else "final",
        )
        return f"error:{status_code}", retryable

    @staticmethod
    def _reason_from_body(body: dict) -> str:
        try:
            return str((body or {}).get("error", {}).get("message", "unknown"))
        except Exception:  # pragma: no cover - defensive
            return "unknown"

    # -------------------------------------------------------------- debounce

    def _is_duplicate(self, camera_identifier: str, plate: str, direction: str, now: float) -> bool:
        key = (camera_identifier, plate, direction)
        last = self._last_observations.get(key)
        if last is not None and (now - last) < self.cooldown_seconds:
            return True
        self._last_observations[key] = now
        return False

    # ------------------------------------------------------------------ main

    def run(self) -> None:
        """Open the source and loop until closed() or end-of-file / failure.

        The loop yields (sleeps to respect process_fps), never busy-spins, and
        propagates shutdown cleanly.
        """
        if not self._ensure_open():
            return
        self._run_loop()

    def _ensure_open(self) -> bool:
        """Open the source with bounded retry. Returns True when opened."""
        attempts = 0
        while not self._stop_flag:
            try:
                self.source.open()
                return True
            except CameraSourceError as exc:
                attempts += 1
                self.stats.read_failures += 1
                if attempts > self.max_reconnects:
                    logger.error(
                        "camera could not be opened after %d attempts; giving up camera=%s",
                        self.max_reconnects,
                        self.camera_identifier,
                    )
                    return False
                logger.warning(
                    "camera open failed (attempt %d/retrying in %.1fs) camera=%s: %s",
                    attempts,
                    self.reconnect_delay,
                    self.camera_identifier,
                    exc,
                )
                self.stats.reconnects += 1
                if self._wait_interruptible(self.reconnect_delay):
                    return False
        return False

    def _run_loop(self) -> None:
        logger.info(
            "vision runtime started camera=%s source=%s fps=%.2f",
            self.camera_identifier,
            self._source_name(),
            self.process_fps,
        )
        frame_interval = 1.0 / self.process_fps
        next_frame_time = time.monotonic()

        while not self._stop_flag:
            # Respect the FPS ceiling between read attempts.
            now = time.monotonic()
            if now < next_frame_time:
                if self._wait_interruptible(next_frame_time - now):
                    break
                continue
            next_frame_time = time.monotonic() + frame_interval

            try:
                frame = self.source.read_frame()
            except FrameReadError as exc:
                self.stats.read_failures += 1
                message = str(getattr(exc, "args", ("",))[0] or "")
                if message == "EOF":
                    # A source that reports end-of-stream is done, not broken:
                    # the natural end of a video file. Stop cleanly.
                    logger.info("camera source reached end-of-stream camera=%s", self.camera_identifier)
                    break
                self.stats.consecutive_read_failures += 1
                if self.stats.consecutive_read_failures >= self.max_consecutive_failures:
                    logger.warning(
                        "camera read failure threshold reached (%d); reconnecting camera=%s",
                        self.max_consecutive_failures,
                        self.camera_identifier,
                    )
                    self._reconnect()
                    continue
                # transient frame miss: skip one frame, keep going
                time.sleep(0.05)
                continue

            self.stats.consecutive_read_failures = 0
            self.stats.frames_read += 1
            self._process_frame(frame)

        self._shutdown()
        logger.info("vision runtime stopped camera=%s", self.camera_identifier)

    def _process_frame(self, frame: np.ndarray) -> None:
        encode_ok, buf = cv2.imencode(".jpg", frame)
        if not encode_ok:
            self.stats.read_failures += 1
            return
        image_bytes = buf.tobytes()
        self.stats.frames_processed += 1
        started = time.monotonic()
        try:
            result = process_image(image_bytes)
        except Exception as exc:  # OCR/detector raised on a valid frame
            logger.warning("frame processing error camera=%s: %s", self.camera_identifier, exc)
            return
        processing_ms = (time.monotonic() - started) * 1000

        if result.status != DetectionStatus.DETECTED or not result.normalized_plate:
            # No plate / low read: nothing meaningful to report. Quietly skip.
            return
        self.stats.detections += 1

        direction = self.event_type
        now = time.monotonic()
        if self._is_duplicate(self.camera_identifier, result.normalized_plate, direction, now):
            return

        event = {
            "cameraIdentifier": self.camera_identifier,
            "sourceEventId": make_source_event_id(image_bytes, self.camera_identifier),
            "eventType": direction,
            "detectedPlate": result.detected_plate,
            "ocrConfidence": result.ocr_confidence,
            "detectedAt": _utcnow_iso(),
        }
        if self.zone_id:
            event["zoneId"] = self.zone_id
        outcome = self._forward(event)
        self.stats.last_event = {
            "cameraIdentifier": self.camera_identifier,
            "plate": result.normalized_plate,
            "direction": direction,
            "outcome": outcome,
            "processingMs": processing_ms,
            "ocrConfidence": result.ocr_confidence,
        }
        self.stats.forwarded += 1
        logger.info(
            "event camera=%s plate_len=%d direction=%s outcome=%s ms=%.1f",
            self.camera_identifier,
            len(result.normalized_plate),
            direction,
            outcome,
            processing_ms,
        )

    def _reconnect(self) -> None:
        if self.stats.reconnects >= self.max_reconnects:
            logger.warning(
                "camera unrecoverable after %d reconnects; stopping camera=%s",
                self.max_reconnects,
                self.camera_identifier,
            )
            self.stats.consecutive_read_failures = 0
            self._stop_flag = True
            return
        self.stats.reconnects += 1
        logger.warning("reconnecting camera=%s", self.camera_identifier)
        self.source.close()
        if self._wait_interruptible(self.reconnect_delay):
            return
        try:
            self.source.open()
        except CameraSourceError as exc:
            logger.warning("reconnect open failed camera=%s: %s", self.camera_identifier, exc)

    def _shutdown(self) -> None:
        try:
            self.source.close()
        except Exception:  # pragma: no cover - defensive
            pass

    def close(self) -> None:
        """Request a clean stop; interruptible waits will exit promptly."""
        self._stop_flag = True

    def _wait_interruptible(self, seconds: float) -> bool:
        """Sleep but abort early on close(). Returns True if stopped."""
        if seconds <= 0:
            return self._stop_flag
        deadline = time.monotonic() + seconds
        while not self._stop_flag:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(0.1, remaining))
        return self._stop_flag


def _utcnow_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
