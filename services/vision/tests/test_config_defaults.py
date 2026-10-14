import importlib

import app.config as config


def test_parada_api_url_defaults_to_ipv4_loopback(monkeypatch):
    # localhost resolves to ::1 first on Windows while the API listens on IPv4,
    # which cost ~2 s per fresh connection (docs/vision/phase14-evaluation.md).
    monkeypatch.delenv("PARADA_API_URL", raising=False)
    try:
        assert importlib.reload(config).PARADA_API_URL == "http://127.0.0.1:4100"
    finally:
        monkeypatch.undo()
        importlib.reload(config)


def test_parada_api_url_env_override_wins(monkeypatch):
    monkeypatch.setenv("PARADA_API_URL", "https://api.example.com")
    try:
        assert importlib.reload(config).PARADA_API_URL == "https://api.example.com"
    finally:
        monkeypatch.undo()
        importlib.reload(config)
