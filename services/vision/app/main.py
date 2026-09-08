import hashlib
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from . import api_client, config
from .pipeline.ocr import get_ocr_engine
from .pipeline.service import process_image
from .schemas import ForwardResult, HealthResponse, VisionEventResponse

logger = logging.getLogger("parada.vision")

_model_state = {"loaded": False, "error": None}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the OCR model once at startup so the first real request isn't
    # slow, and so the service can report unhealthy immediately if the model
    # fails to load rather than silently falling back to fake OCR later.
    try:
        get_ocr_engine()
        _model_state["loaded"] = True
    except Exception as exc:  # pragma: no cover - exercised via mocked test
        _model_state["loaded"] = False
        _model_state["error"] = str(exc)
        logger.error("OCR model failed to load: %s", exc)
    yield


app = FastAPI(title="PARADA Vision Service", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if not _model_state["loaded"]:
        return HealthResponse(status="unhealthy", modelLoaded=False, detail=_model_state["error"])
    return HealthResponse(status="ok", modelLoaded=True)


def _make_source_event_id(image_bytes: bytes, camera_identifier: str) -> str:
    # Deterministic per physical observation: same frame + same camera always
    # hashes to the same id, so a client retry after a network blip re-sends
    # the identical sourceEventId and the API's unique constraint on
    # (cameraId, sourceEventId) absorbs the duplicate instead of double-counting.
    digest = hashlib.sha256(image_bytes + camera_identifier.encode("utf-8")).hexdigest()
    return f"vision-{digest[:24]}"


@app.post("/detect", response_model=VisionEventResponse)
async def detect(
    image: UploadFile = File(...),
    cameraIdentifier: str = Form(...),
    eventType: str = Form(...),
    zoneId: str | None = Form(None),
    detectedAt: str | None = Form(None),
    forward: bool = Form(False),
) -> JSONResponse:
    if not _model_state["loaded"]:
        raise HTTPException(status_code=503, detail="OCR model is not loaded")
    if eventType not in ("ENTRY", "EXIT"):
        raise HTTPException(status_code=400, detail="eventType must be 'ENTRY' or 'EXIT'")
    if not cameraIdentifier:
        raise HTTPException(status_code=400, detail="cameraIdentifier is required")

    image_bytes = await image.read()
    if len(image_bytes) > config.MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"image exceeds max size of {config.MAX_IMAGE_BYTES} bytes",
        )

    started = time.monotonic()
    try:
        result = process_image(image_bytes)
    except ValueError as exc:
        # Invalid/corrupt/empty image — a clean 400, never a stack trace or
        # raw exception dump.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    processing_ms = (time.monotonic() - started) * 1000

    if detectedAt is not None:
        try:
            datetime.fromisoformat(detectedAt.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="detectedAt must be a valid ISO date string") from exc
        detected_at = detectedAt
    else:
        detected_at = datetime.now(timezone.utc).isoformat()

    source_event_id = _make_source_event_id(image_bytes, cameraIdentifier)

    # Diagnostics only — never the raw image bytes/pixels or full plate value
    # in a way that would leak into shared logs unnecessarily.
    logger.info(
        "detect camera=%s status=%s detConf=%s ocrConf=%s ms=%.1f",
        cameraIdentifier,
        result.status.value,
        result.detection_confidence,
        result.ocr_confidence,
        processing_ms,
    )

    response = VisionEventResponse(
        sourceEventId=source_event_id,
        cameraIdentifier=cameraIdentifier,
        eventType=eventType,
        detectedPlate=result.detected_plate,
        normalizedPlate=result.normalized_plate,
        ocrConfidence=result.ocr_confidence,
        detectedAt=detected_at,
        status=result.status.value,
        detectionConfidence=result.detection_confidence,
        candidatesConsidered=result.candidates_considered,
        processingMs=processing_ms,
    )

    payload = response.model_dump()

    if forward:
        if not zoneId:
            raise HTTPException(status_code=400, detail="zoneId is required when forward=true")
        event = {
            "cameraIdentifier": response.cameraIdentifier,
            "sourceEventId": response.sourceEventId,
            "eventType": response.eventType,
            "detectedPlate": response.detectedPlate,
            "ocrConfidence": response.ocrConfidence,
            "detectedAt": response.detectedAt,
        }
        try:
            status_code, body = api_client.forward_event(zoneId, event)
            payload["forwardResult"] = ForwardResult(forwarded=True, status_code=status_code, body=body).model_dump()
        except Exception as exc:  # network failure talking to the API
            payload["forwardResult"] = ForwardResult(forwarded=False, error=str(exc)).model_dump()

    return JSONResponse(status_code=200, content=payload)
