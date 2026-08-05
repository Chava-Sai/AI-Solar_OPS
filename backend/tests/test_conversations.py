"""Server-side conversation persistence: scoped strictly to the caller's own session."""


def _unlocked_session(client, email, password):
    """Log in, force through the password change, return the resulting session
    cookie value so the test can switch between users on one shared client."""
    client.post("/api/auth/login", json={"email": email, "password": password})
    client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": "BrandNewPass1"},
    )
    return client.cookies.get("astra_session")


def test_conversations_round_trip(client, make_user):
    email, password = make_user(email="convo1@amgsol.com")
    client.cookies.set("astra_session", _unlocked_session(client, email, password))

    payload = {"conversations": [{"id": "c1", "title": "Panel fault SOP", "messages": []}]}
    r = client.put("/api/chat/conversations", json=payload)
    assert r.status_code == 200
    assert r.json()["count"] == 1

    r = client.get("/api/chat/conversations")
    assert r.status_code == 200
    assert r.json()["conversations"][0]["id"] == "c1"


def test_conversations_are_scoped_per_user_not_shared(client, make_user):
    email_a, pw_a = make_user(email="convoa@amgsol.com")
    session_a = _unlocked_session(client, email_a, pw_a)
    email_b, pw_b = make_user(email="convob@amgsol.com")
    session_b = _unlocked_session(client, email_b, pw_b)

    client.cookies.set("astra_session", session_a)
    client.put(
        "/api/chat/conversations",
        json={"conversations": [{"id": "only-a", "title": "A's chat", "messages": []}]},
    )

    client.cookies.set("astra_session", session_b)
    r = client.get("/api/chat/conversations")
    assert r.json()["conversations"] == []  # B never wrote anything and can't see A's data

    client.cookies.set("astra_session", session_a)
    r = client.get("/api/chat/conversations")
    assert r.json()["conversations"][0]["id"] == "only-a"


def test_conversations_put_replaces_not_merges(client, make_user):
    email, password = make_user(email="convoreplace@amgsol.com")
    client.cookies.set("astra_session", _unlocked_session(client, email, password))

    client.put(
        "/api/chat/conversations",
        json={"conversations": [{"id": "c1", "title": "First", "messages": []}]},
    )
    client.put(
        "/api/chat/conversations",
        json={"conversations": [{"id": "c2", "title": "Second", "messages": []}]},
    )
    r = client.get("/api/chat/conversations")
    ids = [c["id"] for c in r.json()["conversations"]]
    assert ids == ["c2"]


def test_profile_name_update_reissues_session_with_new_name(client, make_user):
    email, password = make_user(email="rename@amgsol.com")
    client.cookies.set("astra_session", _unlocked_session(client, email, password))

    r = client.put("/api/auth/profile", json={"name": "New Display Name"})
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "New Display Name"


def test_profile_name_cannot_be_blank(client, make_user):
    email, password = make_user(email="blankname@amgsol.com")
    client.cookies.set("astra_session", _unlocked_session(client, email, password))

    r = client.put("/api/auth/profile", json={"name": "   "})
    assert r.status_code == 400
