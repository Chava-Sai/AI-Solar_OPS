"""Server-side conversation persistence: scoped strictly to the caller's own JWT email."""


def _unlocked_headers(client, email, password):
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": "BrandNewPass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_conversations_round_trip(client, make_user):
    email, password = make_user(email="convo1@amgsol.com")
    headers = _unlocked_headers(client, email, password)

    payload = {"conversations": [{"id": "c1", "title": "Panel fault SOP", "messages": []}]}
    r = client.put("/api/chat/conversations", json=payload, headers=headers)
    assert r.status_code == 200
    assert r.json()["count"] == 1

    r = client.get("/api/chat/conversations", headers=headers)
    assert r.status_code == 200
    assert r.json()["conversations"][0]["id"] == "c1"


def test_conversations_are_scoped_per_user_not_shared(client, make_user):
    email_a, pw_a = make_user(email="convoa@amgsol.com")
    email_b, pw_b = make_user(email="convob@amgsol.com")
    headers_a = _unlocked_headers(client, email_a, pw_a)
    headers_b = _unlocked_headers(client, email_b, pw_b)

    client.put(
        "/api/chat/conversations",
        json={"conversations": [{"id": "only-a", "title": "A's chat", "messages": []}]},
        headers=headers_a,
    )

    r = client.get("/api/chat/conversations", headers=headers_b)
    assert r.json()["conversations"] == []  # B never wrote anything and can't see A's data

    r = client.get("/api/chat/conversations", headers=headers_a)
    assert r.json()["conversations"][0]["id"] == "only-a"


def test_conversations_put_replaces_not_merges(client, make_user):
    email, password = make_user(email="convoreplace@amgsol.com")
    headers = _unlocked_headers(client, email, password)

    client.put(
        "/api/chat/conversations",
        json={"conversations": [{"id": "c1", "title": "First", "messages": []}]},
        headers=headers,
    )
    client.put(
        "/api/chat/conversations",
        json={"conversations": [{"id": "c2", "title": "Second", "messages": []}]},
        headers=headers,
    )
    r = client.get("/api/chat/conversations", headers=headers)
    ids = [c["id"] for c in r.json()["conversations"]]
    assert ids == ["c2"]


def test_profile_name_update_reissues_token_with_new_name(client, make_user):
    email, password = make_user(email="rename@amgsol.com")
    headers = _unlocked_headers(client, email, password)

    r = client.put("/api/auth/profile", json={"name": "New Display Name"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "New Display Name"


def test_profile_name_cannot_be_blank(client, make_user):
    email, password = make_user(email="blankname@amgsol.com")
    headers = _unlocked_headers(client, email, password)

    r = client.put("/api/auth/profile", json={"name": "   "}, headers=headers)
    assert r.status_code == 400
