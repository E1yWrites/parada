"""Phase 14 — end-to-end Vision -> API latency, measured against LIVE services.

    python -m evaluation.run_e2e_latency [--cycles 20] [--out evaluation/results]

Requires (all real processes, nothing mocked):
  * the PARADA API running with a seeded dev database
    (`npm run dev:api` from the repo root; seed = packages/database `npm run seed`),
    reachable at PARADA_API_URL (default http://localhost:4100);
  * this Vision service running (`npm run dev -w @parada/vision`), reachable at
    VISION_URL (default http://localhost:8001);
  * CAMERA_API_KEY exported for this process if the API enforces one.

What is measured (wall clock, from this client, per event):
  pipeline_inprocess_ms   process_image() on the frame, in this process (no HTTP)
  vision_http_ms          POST {VISION_URL}/detect, forward=false — upload + inference + JSON
  api_direct_ms           POST {API}/zones/:id/events with a ready event — API + domain + DB commit
  vision_forward_ms       POST {VISION_URL}/detect, forward=true — the full Vision -> API chain
                          (also reports the API status distribution from forwardResult)
  sse_delivery_ms         optional (--sse): with an admin SSE subscriber connected to
                          GET {API}/realtime/stream, time from the start of the
                          forward=true POST until the ZONE_OCCUPANCY_UPDATED frame for the
                          zone arrives at the subscriber — Vision -> API -> DB commit -> SSE.
                          Needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD in the environment
                          (the seeded admin); credentials are used for login only, never
                          written to the results.

The seeded registered plate ABC-1234 is rendered (base evaluation geometry) so
the API exercises the REGISTERED path: ENTRY through cam-a-main-gate opens a
ParkingSession, EXIT through cam-a-north-gate closes it with a fee. Every frame is
made byte-unique (one background pixel varies) so sourceEventId differs and
the API's idempotency key does not collapse the run. Zone occupancy is read
before and after to show the run leaves the zone where it started.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import threading
import time
from datetime import datetime, timezone

import cv2
import httpx
import numpy as np

from app import config
from app.pipeline.service import process_image
from evaluation import dataset as ds
from evaluation.metrics import latency_summary

VISION_URL = os.environ.get("VISION_URL", "http://localhost:8001")
API_URL = config.PARADA_API_URL
PLATE_TEXT = "ABC 1234"  # seeded registered vehicle ABC-1234 (packages/database/src/seed)
ZONE_CODE = os.environ.get("E2E_ZONE_CODE", "A")
# Seeded Zone A gate cameras (both BIDIRECTIONAL): ENTRY frames go through the
# main gate, EXIT frames through the north gate.
CAM_ENTRY = os.environ.get("E2E_CAMERA_ENTRY", "cam-a-main-gate")
CAM_EXIT = os.environ.get("E2E_CAMERA_EXIT", "cam-a-north-gate")


RUN_NONCE = int(time.time()) & 0xFFFF  # makes frames unique ACROSS runs too


def _frame(i: int) -> bytes:
    plate = ds.render_plate(PLATE_TEXT, ds._find_font())
    scene = np.full((ds.FRAME_H, ds.FRAME_W, 3), ds.BG, dtype=np.uint8)
    ds._paste(scene, plate, 300, 267)
    # Two background pixels encode (frame index, run nonce): byte-unique frame
    # => unique sourceEventId, so no run is collapsed by the API's idempotency
    # key against an earlier run's events.
    scene[5, 5] = (i % 256, (i // 256) % 256, 7)
    scene[5, 6] = (RUN_NONCE % 256, RUN_NONCE // 256, 11)
    ok, buf = cv2.imencode(".png", scene)
    assert ok
    return buf.tobytes()


def _api_headers() -> dict:
    h = {"Content-Type": "application/json"}
    if config.CAMERA_API_KEY:
        h["X-API-Key"] = config.CAMERA_API_KEY
    return h


def _zone(client: httpx.Client) -> dict:
    zones = client.get(f"{API_URL}/zones").json()["data"]
    for z in zones:
        if z["code"] == ZONE_CODE:
            return z
    raise SystemExit(f"zone {ZONE_CODE!r} not found in {API_URL}/zones — seed the dev database")


def _occupancy(client: httpx.Client, zone_id: str) -> dict:
    d = client.get(f"{API_URL}/zones/{zone_id}/occupancy").json()["data"]
    return {"occupiedCount": d["occupiedCount"], "availableCount": d["availableCount"]}


class SseSubscriber:
    """Minimal SSE reader over httpx streaming: records (perf_counter, event,
    data) for every frame so delivery latency can be attributed per event."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.frames: list[tuple[float, str, dict]] = []
        self.connected = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        with httpx.Client(timeout=None) as c:
            with c.stream("GET", f"{API_URL}/realtime/stream", headers={"Authorization": f"Bearer {self.token}"}) as r:
                if r.status_code != 200:
                    raise RuntimeError(f"SSE stream status {r.status_code}")
                event, data = None, []
                for line in r.iter_lines():
                    if self._stop.is_set():
                        break
                    if line.startswith(": connected"):
                        self.connected.set()
                    elif line.startswith("event:"):
                        event = line[6:].strip()
                    elif line.startswith("data:"):
                        data.append(line[5:].strip())
                    elif line == "":
                        if event and data:
                            try:
                                payload = json.loads("".join(data))
                            except ValueError:
                                payload = {}
                            self.frames.append((time.perf_counter(), event, payload))
                        event, data = None, []

    def start(self) -> "SseSubscriber":
        self._thread.start()
        if not self.connected.wait(10):
            raise SystemExit("SSE subscriber did not connect within 10 s")
        return self

    def stop(self) -> None:
        self._stop.set()

    def wait_for(self, predicate, since_index: int, timeout: float = 5.0) -> tuple[float, dict] | None:
        deadline = time.perf_counter() + timeout
        while time.perf_counter() < deadline:
            for ts, ev, payload in self.frames[since_index:]:
                if predicate(ev, payload):
                    return ts, payload
            time.sleep(0.001)
        return None


def _admin_token(client: httpx.Client) -> str:
    email, password = os.environ.get("E2E_ADMIN_EMAIL"), os.environ.get("E2E_ADMIN_PASSWORD")
    if not email or not password:
        raise SystemExit("--sse needs E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (the seeded admin) in the environment")
    res = client.post(f"{API_URL}/auth/login", json={"email": email, "password": password})
    if res.status_code != 200:
        raise SystemExit(f"admin login failed: {res.status_code}")
    return res.json()["data"]["token"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument("--cycles", type=int, default=20, help="ENTRY+EXIT pairs per measurement")
    parser.add_argument("--out", default=os.path.join(here, "results"))
    parser.add_argument("--sse", action="store_true", help="also measure Vision -> API -> SSE delivery to an admin subscriber")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    with httpx.Client(timeout=30.0) as client:
        health = client.get(f"{API_URL}/health").json()
        vhealth = client.get(f"{VISION_URL}/health").json()
        if not vhealth.get("modelLoaded"):
            raise SystemExit(f"vision service unhealthy: {vhealth}")
        zone = _zone(client)
        zone_id = zone["id"]
        before = _occupancy(client, zone_id)
        print(f"api={API_URL} health={health.get('data', health)}  vision={VISION_URL} {vhealth}")
        print(f"zone {ZONE_CODE} ({zone_id}) occupancy before: {before}")

        # Pre-flight: close any ACTIVE session the seeded plate may still hold
        # from earlier development runs (a stale ACTIVE session would make the
        # first ENTRY a 409 and shift every pair). Not timed; status recorded.
        preflight = client.post(
            f"{API_URL}/zones/{zone_id}/events",
            json={
                "cameraIdentifier": CAM_EXIT,
                "sourceEventId": f"phase14-e2e-preflight-{int(time.time() * 1000)}",
                "eventType": "EXIT",
                "detectedPlate": PLATE_TEXT,
                "ocrConfidence": 0.99,
                "detectedAt": datetime.now(timezone.utc).isoformat(),
            },
            headers=_api_headers(),
        )
        print(f"pre-flight EXIT for {PLATE_TEXT}: {preflight.status_code} (201 = stale session closed; 409 = nothing to close)")
        before = _occupancy(client, zone_id)

        # Warm both services once (first request carries connection setup).
        client.post(
            f"{VISION_URL}/detect",
            files={"image": ("f.png", _frame(10_000), "image/png")},
            data={"cameraIdentifier": CAM_ENTRY, "eventType": "ENTRY"},
        )

        process_image(_frame(10_001))  # in-process warm-up: lazy model load + first-call JIT

        seq = 0
        # 1) in-process pipeline on the same frame kind
        pipeline_ms: list[float] = []
        pipeline_reads: list[str | None] = []
        for _ in range(args.cycles):
            b = _frame(seq); seq += 1
            t = time.perf_counter()
            r = process_image(b)
            pipeline_ms.append((time.perf_counter() - t) * 1000)
            pipeline_reads.append(r.normalized_plate)

        # 2) vision over HTTP, no forwarding
        vision_http_ms: list[float] = []
        vision_processing_ms: list[float] = []
        vision_reads: list[str | None] = []
        for _ in range(args.cycles):
            b = _frame(seq); seq += 1
            t = time.perf_counter()
            res = client.post(
                f"{VISION_URL}/detect",
                files={"image": ("f.png", b, "image/png")},
                data={"cameraIdentifier": CAM_ENTRY, "eventType": "ENTRY"},
            )
            vision_http_ms.append((time.perf_counter() - t) * 1000)
            body = res.json()
            vision_processing_ms.append(body["processingMs"])
            vision_reads.append(body["normalizedPlate"])

        # 3) API direct with a ready-made registered-plate event (ENTRY/EXIT pairs)
        api_direct_ms: list[float] = []
        api_direct_status: dict[str, int] = {}
        for i in range(args.cycles * 2):
            entry = i % 2 == 0
            event = {
                "cameraIdentifier": CAM_ENTRY if entry else CAM_EXIT,
                "sourceEventId": f"phase14-e2e-direct-{int(time.time() * 1000)}-{i}",
                "eventType": "ENTRY" if entry else "EXIT",
                "detectedPlate": PLATE_TEXT,
                "ocrConfidence": 0.99,
                "detectedAt": datetime.now(timezone.utc).isoformat(),
            }
            t = time.perf_counter()
            res = client.post(f"{API_URL}/zones/{zone_id}/events", json=event, headers=_api_headers())
            api_direct_ms.append((time.perf_counter() - t) * 1000)
            api_direct_status[str(res.status_code)] = api_direct_status.get(str(res.status_code), 0) + 1

        # 4) full chain: vision over HTTP with forward=true (ENTRY/EXIT pairs)
        forward_ms: list[float] = []
        forward_status: dict[str, int] = {}
        forward_reads: list[str | None] = []
        for i in range(args.cycles * 2):
            entry = i % 2 == 0
            b = _frame(seq); seq += 1
            t = time.perf_counter()
            res = client.post(
                f"{VISION_URL}/detect",
                files={"image": ("f.png", b, "image/png")},
                data={
                    "cameraIdentifier": CAM_ENTRY if entry else CAM_EXIT,
                    "eventType": "ENTRY" if entry else "EXIT",
                    "zoneId": zone_id,
                    "forward": "true",
                },
            )
            forward_ms.append((time.perf_counter() - t) * 1000)
            body = res.json()
            fr = body.get("forwardResult") or {}
            key = str(fr.get("status_code")) if fr.get("forwarded") else f"transport-error:{fr.get('error')}"
            forward_status[key] = forward_status.get(key, 0) + 1
            forward_reads.append(body["normalizedPlate"])

        # 5) optional: full chain + realtime delivery to an admin SSE subscriber
        sse_ms: list[float] = []
        sse_missing = 0
        sse_status: dict[str, int] = {}
        if args.sse:
            subscriber = SseSubscriber(_admin_token(client)).start()
            try:
                for i in range(args.cycles * 2):
                    entry = i % 2 == 0
                    b = _frame(seq); seq += 1
                    since = len(subscriber.frames)
                    t = time.perf_counter()
                    res = client.post(
                        f"{VISION_URL}/detect",
                        files={"image": ("f.png", b, "image/png")},
                        data={
                            "cameraIdentifier": CAM_ENTRY if entry else CAM_EXIT,
                            "eventType": "ENTRY" if entry else "EXIT",
                            "zoneId": zone_id,
                            "forward": "true",
                        },
                    )
                    fr = (res.json().get("forwardResult") or {})
                    sse_status[str(fr.get("status_code"))] = sse_status.get(str(fr.get("status_code")), 0) + 1
                    hit = subscriber.wait_for(
                        lambda ev, p: ev == "ZONE_OCCUPANCY_UPDATED" and (p.get("payload") or {}).get("zoneId") == zone_id,
                        since,
                    )
                    if hit is None:
                        sse_missing += 1
                    else:
                        sse_ms.append((hit[0] - t) * 1000)
            finally:
                subscriber.stop()

        after = _occupancy(client, zone_id)
        print(f"zone {ZONE_CODE} occupancy after: {after}")

    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "api_url": API_URL,
        "vision_url": VISION_URL,
        "host": {"platform": platform.platform(), "cpu": platform.processor(), "logical_cpus": os.cpu_count()},
        "zone": {"code": ZONE_CODE, "id": zone_id, "occupancy_before": before, "occupancy_after": after},
        "preflight_exit_status": preflight.status_code,
        "cameras": {"entry": CAM_ENTRY, "exit": CAM_EXIT},
        "plate": PLATE_TEXT,
        "cycles": args.cycles,
        "pipeline_inprocess": {**latency_summary(pipeline_ms), "reads_correct": sum(r == "ABC1234" for r in pipeline_reads)},
        "vision_http": {**latency_summary(vision_http_ms), "reads_correct": sum(r == "ABC1234" for r in vision_reads)},
        "vision_http_server_processing": latency_summary(vision_processing_ms),
        "api_direct": {**latency_summary(api_direct_ms), "status": api_direct_status},
        "vision_forward": {**latency_summary(forward_ms), "status": forward_status, "reads_correct": sum(r == "ABC1234" for r in forward_reads)},
        "vision_forward_sse_delivery": (
            {**latency_summary(sse_ms), "frames_not_received_within_5s": sse_missing, "status": sse_status} if args.sse else None
        ),
    }
    path = os.path.join(args.out, "e2e_latency.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(json.dumps({k: v for k, v in results.items() if k not in ("host",)}, indent=2))
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
