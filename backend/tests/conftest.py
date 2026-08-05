"""
Shared pytest fixtures. Each test run points USERS/CONVERSATIONS/USAGE data
files at a fresh temp path so tests never touch real dev/prod JSON stores and
never leak state between test modules.
"""
import os
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("USERS_DATA_PATH", str(tmp_path / "users_data.json"))
    monkeypatch.setenv("CONVERSATIONS_DATA_PATH", str(tmp_path / "conversations_data.json"))
    monkeypatch.setenv("USAGE_DATA_PATH", str(tmp_path / "usage_data.json"))
    monkeypatch.setenv("LOGIN_RATE_WINDOW_SECONDS", "900")
    monkeypatch.setenv("LOGIN_EMAIL_ATTEMPT_LIMIT", "5")
    monkeypatch.setenv("LOGIN_IP_ATTEMPT_LIMIT", "20")
    monkeypatch.setenv("LOGIN_MIN_RESPONSE_SECONDS", "0")  # keep the suite fast; timing is covered separately

    # Every test module gets a clean import of app.* / main so module-level
    # `_data = _load()` caches (database.py, usage.py, conversations.py) pick
    # up this test's env vars instead of a previous test's temp files.
    for mod in list(sys.modules):
        if mod == "main" or mod.startswith("app."):
            del sys.modules[mod]

    from fastapi.testclient import TestClient
    from main import app

    # https:// base_url so the Secure-flagged session cookie actually gets
    # stored/sent by httpx's cookie jar — matches real production (Vercel
    # and Cloud Run are both HTTPS-only), unlike TestClient's plain-http
    # default which would silently drop it.
    with TestClient(app, base_url="https://testserver") as c:
        yield c


def _login_admin(client):
    r = client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
    assert r.status_code == 200, r.text
    return r


@pytest.fixture()
def admin_client(client):
    """The shared `client`, logged in as the seed admin — auth rides on its
    cookie jar from here on, exactly like a browser tab. Logging in again
    later (as a different user) just replaces the cookie."""
    _login_admin(client)
    return client


@pytest.fixture()
def make_user(client):
    """Factory: create a user via the admin API, return (email, password).
    Logs `client` in as admin first every call, so it works regardless of
    whose session the client was holding beforehand."""

    def _make(email="teammate@amgsol.com", password="TempPass1234", role="user", name="Teammate"):
        _login_admin(client)
        r = client.post(
            "/api/admin/users",
            json={"email": email, "name": name, "password": password, "role": role},
        )
        assert r.status_code == 200, r.text
        return email, password

    yield _make
