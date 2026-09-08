from pydantic import BaseModel


class VisionEventResponse(BaseModel):
    """Matches the NormalizedVisionEvent contract the existing API's
    POST /zones/:zoneId/events endpoint already accepts
    (services/api/src/domain/occupancy.ts), plus vision-only diagnostic
    fields (status, detectionConfidence, processingMs) that are not part of
    that contract and are dropped before forwarding.
    """

    sourceEventId: str
    cameraIdentifier: str
    eventType: str
    detectedPlate: str | None
    normalizedPlate: str | None
    ocrConfidence: float | None
    detectedAt: str

    # Diagnostics, not part of the API contract:
    status: str
    detectionConfidence: float | None
    candidatesConsidered: int
    processingMs: float


class ForwardResult(BaseModel):
    forwarded: bool
    status_code: int | None = None
    body: dict | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: str
    modelLoaded: bool
    detail: str | None = None
