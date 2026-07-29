"""
User + chat-history store.

Users persist to a JSON file (USERS_FILE) rather than living in memory only —
same pattern as app/usage.py — so accounts an admin adds via the Admin panel
survive as long as the backend instance keeps running. A real database is the
eventual replacement (see README's "Database design" section); this is a
pragmatic step up from hardcoding accounts directly in this file.
"""
import os
import json
import logging
import threading
from datetime import datetime
from pathlib import Path

from app.auth import hash_password

logger = logging.getLogger(__name__)

USERS_FILE = Path(os.getenv("USERS_DATA_PATH", "./users_data.json"))
VALID_ROLES = ("admin", "user")

_lock = threading.Lock()


def _seed_users() -> dict:
    return {
        "arunpandian@amgsol.com": {
            "id": 1,
            "email": "Arunpandian@amgsol.com",
            "name": "Arun Pandian",
            "role": "admin",
            "hashed_password": hash_password("Arun@123"),
        }
    }


def _load() -> dict:
    if USERS_FILE.exists():
        try:
            data = json.loads(USERS_FILE.read_text())
            if data.get("users"):
                return data
        except Exception:
            pass
    return {"users": _seed_users(), "next_id": 2}


def _save(data: dict):
    try:
        USERS_FILE.write_text(json.dumps(data, indent=2))
    except Exception as e:
        logger.error(f"[Users] Failed to persist users: {e}")


_data = _load()
_save(_data)  # persist the seed account on first boot


def get_user(email: str):
    return _data["users"].get(email.strip().lower())


def list_users() -> list:
    return [
        {"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"]}
        for u in sorted(_data["users"].values(), key=lambda u: u["id"])
    ]


def create_user(email: str, name: str, password: str, role: str) -> dict:
    key = email.strip().lower()
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role '{role}'. Must be one of {VALID_ROLES}.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    with _lock:
        if key in _data["users"]:
            raise ValueError(f"An account with email '{email}' already exists.")
        user = {
            "id": _data["next_id"],
            "email": email.strip(),
            "name": name.strip() or email.split("@")[0],
            "role": role,
            "hashed_password": hash_password(password),
        }
        _data["users"][key] = user
        _data["next_id"] += 1
        _save(_data)
        return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


def delete_user(email: str, requester_email: str):
    key = email.strip().lower()
    with _lock:
        if key not in _data["users"]:
            raise ValueError("User not found.")
        if key == requester_email.strip().lower():
            raise ValueError("You can't remove your own account.")
        admins_left = sum(1 for u in _data["users"].values() if u["role"] == "admin")
        if _data["users"][key]["role"] == "admin" and admins_left <= 1:
            raise ValueError("Can't remove the last admin account.")
        del _data["users"][key]
        _save(_data)


def update_password(email: str, new_password: str):
    key = email.strip().lower()
    if len(new_password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    with _lock:
        if key not in _data["users"]:
            raise ValueError("User not found.")
        _data["users"][key]["hashed_password"] = hash_password(new_password)
        _save(_data)


def update_name(email: str, new_name: str) -> dict:
    key = email.strip().lower()
    new_name = new_name.strip()
    if not new_name:
        raise ValueError("Name can't be empty.")
    with _lock:
        if key not in _data["users"]:
            raise ValueError("User not found.")
        _data["users"][key]["name"] = new_name
        _save(_data)
        u = _data["users"][key]
        return {"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"]}


# ── In-memory chat history (team-wide History tab) ─────
CHAT_HISTORY: list = []
_chat_id_counter = 1


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
    Admins → see everyone's history.
    Users → see only their own.
    """
    if role == "admin":
        return sorted(CHAT_HISTORY, key=lambda x: x["timestamp"], reverse=True)
    return sorted(
        [h for h in CHAT_HISTORY if h["user_email"] == user_email],
        key=lambda x: x["timestamp"],
        reverse=True,
    )
