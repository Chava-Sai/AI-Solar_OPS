"""
In-memory database for demo.
Will be replaced with PostgreSQL + ChromaDB in production.
"""
from app.auth import hash_password
from datetime import datetime

# ── Pre-seeded users (team pilot / test accounts) ──────
# Password for every account below: astra2026
TEST_PASSWORD = "astra2026"

USERS = {
    "arun@ags.com": {
        "id": 1,
        "email": "arun@ags.com",
        "name": "Arun Pandian",
        "role": "manager",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "priya.lead@ags.com": {
        "id": 2,
        "email": "priya.lead@ags.com",
        "name": "Priya Ramesh",
        "role": "lead_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "karthik.lead@ags.com": {
        "id": 3,
        "email": "karthik.lead@ags.com",
        "name": "Karthik Subramanian",
        "role": "lead_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "divya@ags.com": {
        "id": 4,
        "email": "divya@ags.com",
        "name": "Divya Krishnan",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "rahul@ags.com": {
        "id": 5,
        "email": "rahul@ags.com",
        "name": "Rahul Mehta",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "sneha@ags.com": {
        "id": 6,
        "email": "sneha@ags.com",
        "name": "Sneha Iyer",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "vikram@ags.com": {
        "id": 7,
        "email": "vikram@ags.com",
        "name": "Vikram Nair",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "ananya@ags.com": {
        "id": 8,
        "email": "ananya@ags.com",
        "name": "Ananya Reddy",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "suresh@ags.com": {
        "id": 9,
        "email": "suresh@ags.com",
        "name": "Suresh Kumar",
        "role": "solar_analyst",
        "hashed_password": hash_password(TEST_PASSWORD),
    },
    "meera@ags.com": {
        "id": 10,
        "email": "meera@ags.com",
        "name": "Meera Pillai",
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
