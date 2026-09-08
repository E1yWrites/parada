"""The single permitted downstream call vision is allowed to make: HTTP to
the existing PARADA API's camera-event endpoint. No Prisma, no PostgreSQL,
no direct database access — see services/vision/README.md "Architecture".
"""

import httpx

from . import config


def forward_event(zone_id: str, event: dict) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if config.CAMERA_API_KEY:
        headers["X-API-Key"] = config.CAMERA_API_KEY

    url = f"{config.PARADA_API_URL}/zones/{zone_id}/events"
    with httpx.Client(timeout=5.0) as client:
        response = client.post(url, json=event, headers=headers)
    try:
        body = response.json()
    except ValueError:
        body = {}
    return response.status_code, body
