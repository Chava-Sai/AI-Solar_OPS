"""Login, rate limiting, timing, and JWT auth-tier behavior."""
import time


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "online"


def test_seed_admin_login(client):
    r = client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "admin"
    assert body["user"]["must_change_password"] is False


def test_login_wrong_password_is_401(client):
    r = client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "wrong"})
    assert r.status_code == 401


def test_login_nonexistent_user_is_401_not_404(client):
    """No user-enumeration signal: unknown email behaves identically to a known email + wrong password."""
    r = client.post("/api/auth/login", json={"email": "nobody@amgsol.com", "password": "whatever"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"


def test_login_email_case_insensitive(client):
    r = client.post("/api/auth/login", json={"email": "ArunPandian@AMGSOL.com", "password": "Arun@123"})
    assert r.status_code == 200


def test_login_min_response_time_is_enforced(client, monkeypatch):
    monkeypatch.setenv("LOGIN_MIN_RESPONSE_SECONDS", "0.3")
    # auth_router reads the env var at import time, so reload it under the patched env.
    import sys
    for mod in ("app.routers.auth_router", "main"):
        sys.modules.pop(mod, None)
    from fastapi.testclient import TestClient
    from main import app as patched_app

    with TestClient(patched_app) as c:
        t0 = time.monotonic()
        c.post("/api/auth/login", json={"email": "nobody@amgsol.com", "password": "x"})
        elapsed = time.monotonic() - t0
    assert elapsed >= 0.29


def test_rate_limit_blocks_after_email_attempt_limit(client, monkeypatch):
    monkeypatch.setenv("LOGIN_EMAIL_ATTEMPT_LIMIT", "3")
    import sys
    for mod in ("app.routers.auth_router", "main"):
        sys.modules.pop(mod, None)
    from fastapi.testclient import TestClient
    from main import app as patched_app

    with TestClient(patched_app) as c:
        for _ in range(3):
            r = c.post("/api/auth/login", json={"email": "target@amgsol.com", "password": "wrong"})
            assert r.status_code == 401
        r = c.post("/api/auth/login", json={"email": "target@amgsol.com", "password": "wrong"})
        assert r.status_code == 429
        assert "Retry-After" in r.headers


def test_rate_limit_does_not_block_a_different_email(client, monkeypatch):
    monkeypatch.setenv("LOGIN_EMAIL_ATTEMPT_LIMIT", "2")
    import sys
    for mod in ("app.routers.auth_router", "main"):
        sys.modules.pop(mod, None)
    from fastapi.testclient import TestClient
    from main import app as patched_app

    with TestClient(patched_app) as c:
        for _ in range(2):
            c.post("/api/auth/login", json={"email": "a@amgsol.com", "password": "wrong"})
        r = c.post("/api/auth/login", json={"email": "b@amgsol.com", "password": "wrong"})
        assert r.status_code == 401  # not 429 — a different email's attempts don't count against it


def test_successful_login_clears_prior_failures(client, monkeypatch):
    monkeypatch.setenv("LOGIN_EMAIL_ATTEMPT_LIMIT", "3")
    import sys
    for mod in ("app.routers.auth_router", "main"):
        sys.modules.pop(mod, None)
    from fastapi.testclient import TestClient
    from main import app as patched_app

    with TestClient(patched_app) as c:
        c.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "wrong"})
        c.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "wrong"})
        r = c.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
        assert r.status_code == 200
        # a fresh round of failures shouldn't be pre-loaded with the earlier 2
        c.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "wrong"})
        r = c.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "wrong"})
        assert r.status_code == 401  # still under the limit of 3


def test_no_token_is_rejected(client):
    r = client.get("/api/auth/me")
    assert r.status_code in (401, 403)


def test_garbage_token_is_rejected(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401
