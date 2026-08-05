"""
Runs the same core behaviors against the real Postgres-backed path (app/db.py)
instead of the JSON-file path — proves DATABASE_URL actually works end to end,
not just that the ORM models import cleanly.

Skips automatically if no local Postgres is reachable (CI/dev machines without
one still get the rest of the suite; this file is the one that needs it).
"""
import os
import sys

import pytest

PG_URL = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://localhost/astra_dev")


def _postgres_reachable():
    try:
        import psycopg
        with psycopg.connect(PG_URL.replace("postgresql+psycopg://", "postgresql://"), connect_timeout=2):
            return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _postgres_reachable(), reason="no local Postgres reachable at TEST_DATABASE_URL")


@pytest.fixture()
def pg_client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", PG_URL)
    monkeypatch.setenv("LOGIN_MIN_RESPONSE_SECONDS", "0")

    for mod in list(sys.modules):
        if mod == "main" or mod.startswith("app."):
            del sys.modules[mod]

    import app.db as dbmod
    dbmod.init_db()
    engine = dbmod.get_engine()
    # start every test from a clean slate — this is a scratch dev DB, not shared state
    with engine.begin() as conn:
        for table in ("chat_log", "usage_daily", "conversation_buckets", "user_id_seq", "users"):
            conn.exec_driver_sql(f'TRUNCATE TABLE {table} CASCADE')

    from fastapi.testclient import TestClient
    from main import app as fastapi_app

    with TestClient(fastapi_app, base_url="https://testserver") as c:
        yield c


def test_seed_admin_exists_in_postgres(pg_client):
    r = pg_client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"


def test_create_user_persists_in_postgres(pg_client):
    pg_client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})

    r = pg_client.post(
        "/api/admin/users",
        json={"email": "pgtest@amgsol.com", "name": "PG Test", "password": "TempPass1234", "role": "user"},
    )
    assert r.status_code == 200, r.text

    r = pg_client.get("/api/admin/users")
    emails = [u["email"].lower() for u in r.json()]
    assert "pgtest@amgsol.com" in emails


def test_data_survives_a_fresh_process_reconnect(pg_client):
    """Simulates a Cloud Run container restart: new engine/session, same DB, data still there."""
    pg_client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
    pg_client.post(
        "/api/admin/users",
        json={"email": "survives@amgsol.com", "name": "Survives Restart", "password": "TempPass1234", "role": "user"},
    )

    # tear down every in-process module + engine, exactly like a fresh container boot
    for mod in list(sys.modules):
        if mod == "main" or mod.startswith("app."):
            del sys.modules[mod]
    from fastapi.testclient import TestClient
    from main import app as fresh_app

    with TestClient(fresh_app, base_url="https://testserver") as fresh_client:
        fresh_client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
        r = fresh_client.get("/api/admin/users")
        emails = [u["email"].lower() for u in r.json()]
        assert "survives@amgsol.com" in emails


def test_conversations_persist_in_postgres(pg_client):
    pg_client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})

    payload = {"conversations": [{"id": "c1", "title": "PG conversation", "messages": []}]}
    r = pg_client.put("/api/chat/conversations", json=payload)
    assert r.status_code == 200

    r = pg_client.get("/api/chat/conversations")
    assert r.json()["conversations"][0]["id"] == "c1"


def test_usage_recording_persists_in_postgres(pg_client):
    import app.usage as usage
    usage.record_llm_call("arunpandian@amgsol.com", "gpt120", "hello", "world", exact_tokens=42)
    snap = usage.get_usage("arunpandian@amgsol.com")
    assert snap["models"]["gpt120"]["tokens_used"] == 42

    # reload from a fresh module import (simulates restart) and confirm it's still there
    for mod in list(sys.modules):
        if mod.startswith("app.usage") or mod == "app.db":
            del sys.modules[mod]
    import app.usage as usage2
    snap2 = usage2.get_usage("arunpandian@amgsol.com")
    assert snap2["models"]["gpt120"]["tokens_used"] == 42
