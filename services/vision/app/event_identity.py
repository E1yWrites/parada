"""Single source of truth for the camera-event idempotency key.

Both ingress paths — the `/detect` HTTP endpoint and the long-running
`CameraRuntime` loop — forward events to the same `POST /zones/:zoneId/events`
route, which deduplicates on the database constraint
`@@unique([cameraId, sourceEventId])`.

Because the two paths share one identity namespace, they must derive the id the
same way: if the same frame from the same camera produced two different ids,
the constraint could not absorb the duplicate and occupancy would be counted
twice. The camera identifier is part of the hash so the id is self-describing
rather than relying on the database's composite key to separate cameras.
"""

import hashlib

SOURCE_EVENT_ID_PREFIX = "vision"
_DIGEST_CHARS = 24


def make_source_event_id(image_bytes: bytes, camera_identifier: str) -> str:
    """Return the deterministic `sourceEventId` for one physical observation."""
    digest = hashlib.sha256(image_bytes + camera_identifier.encode("utf-8")).hexdigest()
    return f"{SOURCE_EVENT_ID_PREFIX}-{digest[:_DIGEST_CHARS]}"
