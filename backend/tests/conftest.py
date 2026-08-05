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

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_token(client):
    r = client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture()
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def make_user(client, admin_headers):
    """Factory: create a user via the admin API, return (email, password)."""
    created = []

    def _make(email="teammate@amgsol.com", password="TempPass1234", role="user", name="Teammate"):
        r = client.post(
            "/api/admin/users",
            json={"email": email, "name": name, "password": password, "role": role},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        created.append(email)
        return email, password

    yield _make
