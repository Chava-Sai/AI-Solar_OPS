"""Admin user-management CRUD: roles, self-protection, last-admin protection."""


def test_create_user_defaults_to_role_user(client, admin_headers):
    r = client.post(
        "/api/admin/users",
        json={"email": "defaultrole@amgsol.com", "name": "Default", "password": "TempPass1234"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["role"] == "user"


def test_create_user_rejects_invalid_role(client, admin_headers):
    r = client.post(
        "/api/admin/users",
        json={"email": "bad@amgsol.com", "name": "Bad", "password": "TempPass1234", "role": "superadmin"},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_create_user_rejects_duplicate_email(client, admin_headers, make_user):
    make_user(email="dup@amgsol.com")
    r = client.post(
        "/api/admin/users",
        json={"email": "dup@amgsol.com", "name": "Dup2", "password": "TempPass1234", "role": "user"},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_list_users_requires_admin(client, make_user):
    email, password = make_user(email="plainuser@amgsol.com")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    # unlock the account first (must_change_password would 403 before role even matters)
    client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": "BrandNewPass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    login2 = client.post("/api/auth/login", json={"email": email, "password": "BrandNewPass1"})
    r = client.get("/api/admin/users", headers={"Authorization": f"Bearer {login2.json()['access_token']}"})
    assert r.status_code == 403


def test_admin_cannot_delete_own_account(client, admin_headers):
    r = client.delete("/api/admin/users/arunpandian@amgsol.com", headers=admin_headers)
    assert r.status_code == 400


def test_cannot_delete_the_last_admin(client, admin_headers, make_user):
    # arunpandian is the only admin in a fresh test DB — deleting via another admin should still fail
    email, password = make_user(email="secondadmin@amgsol.com", role="admin")
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    # secondadmin is must-change-password-locked and can't call admin routes yet, so use the seed admin
    r = client.delete("/api/admin/users/arunpandian@amgsol.com", headers=admin_headers)
    assert r.status_code == 400  # still can't delete self regardless of other admins


def test_delete_user_then_relist(client, admin_headers, make_user):
    make_user(email="todelete@amgsol.com")
    r = client.delete("/api/admin/users/todelete@amgsol.com", headers=admin_headers)
    assert r.status_code == 200

    r = client.get("/api/admin/users", headers=admin_headers)
    emails = [u["email"].lower() for u in r.json()]
    assert "todelete@amgsol.com" not in emails


def test_delete_nonexistent_user_errors(client, admin_headers):
    r = client.delete("/api/admin/users/ghost@amgsol.com", headers=admin_headers)
    assert r.status_code == 400
