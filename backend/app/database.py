"""
In-memory database for demo.
Will be replaced with PostgreSQL + ChromaDB in production.
"""
from app.auth import hash_password
from datetime import datetime

# ── Pre-seeded users (team pilot / test accounts) ──────
# Password for every account below: test1234
TEST_PASSWORD = "test1234"

USERS = {
    "test1@ags.com": {
        "id": 1,
        "email": "test1@ags.com",
        "name": "Test User 1",
        "role": "manager",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test2@ags.com": {
        "id": 2,
        "email": "test2@ags.com",
        "name": "Test User 2",
        "role": "lead_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test3@ags.com": {
        "id": 3,
        "email": "test3@ags.com",
        "name": "Test User 3",
        "role": "lead_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test4@ags.com": {
        "id": 4,
        "email": "test4@ags.com",
        "name": "Test User 4",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test5@ags.com": {
        "id": 5,
        "email": "test5@ags.com",
        "name": "Test User 5",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test6@ags.com": {
        "id": 6,
        "email": "test6@ags.com",
        "name": "Test User 6",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test7@ags.com": {
        "id": 7,
        "email": "test7@ags.com",
        "name": "Test User 7",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test8@ags.com": {
        "id": 8,
        "email": "test8@ags.com",
        "name": "Test User 8",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test9@ags.com": {
        "id": 9,
        "email": "test9@ags.com",
        "name": "Test User 9",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "test10@ags.com": {
        "id": 10,
        "email": "test10@ags.com",
        "name": "Test User 10",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
}

# ── In-memory chat history ─────────────────────────────
CHAT_HISTORY: list = []
_chat_id_counter = 1

def get_user(email: str):
    return USERS.get(email)

def save_chat(user_email: str, user_name: str, query: str, answer: str):
    global _chat_id_counter
    record = {
        "id": _chat_id_counter,
        "user_email": user_email,
        "user_name": user_name,
        "query": query,
        "answer": answer,
        "timestamp": datetime.utcnow(),
    }
    CHAT_HISTORY.append(record)
    _chat_id_counter += 1
    return record

def get_history(user_email: str = None, role: str = None) -> list:
    """
    Managers & Lead Analysts → see all history.
    Solar Analysts → see only their own.
    """
    if role in ("manager", "lead_analyst"):
        return sorted(CHAT_HISTORY, key=lambda x: x["timestamp"], reverse=True)
    return sorted(
        [h for h in CHAT_HISTORY if h["user_email"] == user_email],
        key=lambda x: x["timestamp"],
        reverse=True,
    )
