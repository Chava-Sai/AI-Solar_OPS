"""Password minimum-length rules and the forced must-change-password flow."""


def test_new_account_requires_min_10_char_password(client, admin_headers):
    r = client.post(
        "/api/admin/users",
        json={"email": "short@amgsol.com", "name": "Short", "password": "abc123", "role": "user"},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_new_account_is_created_with_must_change_password_true(client, make_user):
    email, password = make_user(email="newbie@amgsol.com")
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    assert r.json()["user"]["must_change_password"] is True


def test_seed_admin_account_is_exempt_from_must_change_password(client):
    r = client.post("/api/auth/login", json={"email": "arunpandian@amgsol.com", "password": "Arun@123"})
    assert r.json()["user"]["must_change_password"] is False


def test_must_change_password_user_is_blocked_from_normal_routes(client, make_user):
    email, password = make_user(email="locked@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/chat/history", headers=headers)
    assert r.status_code == 403
    r = client.get("/api/chat/conversations", headers=headers)
    assert r.status_code == 403


def test_must_change_password_user_can_still_reach_me_and_change_password(client, make_user):
    email, password = make_user(email="locked2@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": "BrandNewPass1"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["user"]["must_change_password"] is False


def test_change_password_clears_flag_and_unlocks_normal_routes(client, make_user):
    email, password = make_user(email="unlock@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": "BrandNewPass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    new_token = r.json()["access_token"]

    r = client.get("/api/chat/history", headers={"Authorization": f"Bearer {new_token}"})
    assert r.status_code == 200

    # the OLD token (still carrying must_change_password=True in its claims) stays blocked —
    # tokens aren't silently re-validated against current DB state mid-request
    r = client.get("/api/chat/history", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_change_password_rejects_wrong_current_password(client, make_user):
    email, password = make_user(email="wrongcur@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "not-the-real-one", "new_password": "BrandNewPass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401


def test_change_password_rejects_short_new_password(client, make_user):
    email, password = make_user(email="tooshort@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": "abc123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400


def test_change_password_rejects_same_as_current(client, make_user):
    email, password = make_user(email="samepass@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": password},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400
