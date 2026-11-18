"""forward_event reuses one pooled HTTP client and sends the camera key."""

from app import api_client, config


class _Response:
    status_code = 201

    def json(self):
        return {"data": {}}


class _StubClient:
    def __init__(self):
        self.calls = []

    def post(self, url, json, headers):
        self.calls.append((url, json, headers))
        return _Response()


def test_forward_event_reuses_a_single_client(monkeypatch):
    stub = _StubClient()
    monkeypatch.setattr(api_client, "_client", stub)
    monkeypatch.setattr(config, "CAMERA_API_KEY", "secret-key")

    assert api_client.forward_event("z1", {"a": 1}) == (201, {"data": {}})
    api_client.forward_event("z1", {"a": 2})

    assert len(stub.calls) == 2
    assert all(c[2]["X-API-Key"] == "secret-key" for c in stub.calls)
    assert stub.calls[0][0].endswith("/zones/z1/events")
