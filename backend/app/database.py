"""
User + chat-history store.

Two backends behind the same function signatures:
  - DATABASE_URL set    -> Postgres (Cloud SQL in production), via app/db.py.
  - DATABASE_URL unset  -> JSON file (USERS_FILE), same as before. Local dev
    and the test suite run this way and never need a running Postgres.

A real database was always the eventual replacement (see README's "Database
design" section) — this is that replacement, kept behind a flag so it can
land without forcing every dev machine to run Postgres.
"""
import os
import json
import logging
import threading
from datetime import datetime
from pathlib import Path

from app.auth import hash_password
from app import db as dbmod

logger = logging.getLogger(__name__)

USERS_FILE = Path(os.getenv("USERS_DATA_PATH", "./users_data.json"))
VALID_ROLES = ("admin", "user")

_lock = threading.Lock()

SEED_EMAIL = "arunpandian@amgsol.com"
SEED_DISPLAY_EMAIL = "Arunpandian@amgsol.com"
SEED_NAME = "Arun Pandian"
SEED_PASSWORD = "Arun@123"


def _seed_users() -> dict:
    return {
        SEED_EMAIL: {
            "id": 1,
            "email": SEED_DISPLAY_EMAIL,
            "name": SEED_NAME,
            "role": "admin",
            "must_change_password": False,
            "hashed_password": hash_password(SEED_PASSWORD),
        }
    }


# ── JSON-file backend ──────────────────────────────────────────
def _load() -> dict:
    if USERS_FILE.exists():
        try:
            data = json.loads(USERS_FILE.read_text())
            if data.get("users"):
                for user in data["users"].values():
                    user.setdefault("must_change_password", False)
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
if not dbmod.is_enabled():
    _save(_data)  # persist the seed account on first boot


# ── Postgres backend ────────────────────────────────────────────
def _pg_seed_if_empty(session):
    if session.query(dbmod.User).count() == 0:
        seed = _seed_users()[SEED_EMAIL]
        session.add(dbmod.User(
            email=SEED_EMAIL, id=seed["id"], display_email=seed["email"],
            name=seed["name"], role=seed["role"],
            hashed_password=seed["hashed_password"],
            must_change_password=seed["must_change_password"],
        ))
        session.add(dbmod.UserIdSeq(id=1, next_id=2))
        session.commit()


def _pg_next_id(session) -> int:
    seq = session.get(dbmod.UserIdSeq, 1)
    if seq is None:
        seq = dbmod.UserIdSeq(id=1, next_id=1)
        session.add(seq)
    next_id = seq.next_id
    seq.next_id += 1
    return next_id


def _pg_to_public(u: "dbmod.User") -> dict:
    return {
        "id": u.id,
        "email": u.display_email,
        "name": u.name,
        "role": u.role,
        "must_change_password": u.must_change_password,
    }


def _pg_to_internal(u: "dbmod.User") -> dict:
    return {**_pg_to_public(u), "hashed_password": u.hashed_password}


if dbmod.is_enabled():
    dbmod.init_db()
    _s = dbmod.get_session()
    try:
        _pg_seed_if_empty(_s)
    finally:
        _s.close()


# ── Public API (used by routers) ────────────────────────────────
def get_user(email: str):
    key = email.strip().lower()
    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            u = session.get(dbmod.User, key)
            return _pg_to_internal(u) if u else None
        finally:
            session.close()
    return _data["users"].get(key)


def list_users() -> list:
    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            users = session.query(dbmod.User).order_by(dbmod.User.id).all()
            return [_pg_to_public(u) for u in users]
        finally:
            session.close()
    return [
        {
            "id": u["id"],
            "email": u["email"],
            "name": u["name"],
            "role": u["role"],
            "must_change_password": u.get("must_change_password", False),
        }
        for u in sorted(_data["users"].values(), key=lambda u: u["id"])
    ]


def create_user(email: str, name: str, password: str, role: str) -> dict:
    key = email.strip().lower()
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role '{role}'. Must be one of {VALID_ROLES}.")
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters.")

    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            if session.get(dbmod.User, key) is not None:
                raise ValueError(f"An account with email '{email}' already exists.")
            new_id = _pg_next_id(session)
            u = dbmod.User(
                email=key, id=new_id, display_email=email.strip(),
                name=name.strip() or email.split("@")[0], role=role,
                hashed_password=hash_password(password), must_change_password=True,
            )
            session.add(u)
            session.commit()
            return _pg_to_public(u)
        finally:
            session.close()

    with _lock:
        if key in _data["users"]:
            raise ValueError(f"An account with email '{email}' already exists.")
        user = {
            "id": _data["next_id"],
            "email": email.strip(),
            "name": name.strip() or email.split("@")[0],
            "role": role,
            "must_change_password": True,
            "hashed_password": hash_password(password),
        }
        _data["users"][key] = user
        _data["next_id"] += 1
        _save(_data)
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "must_change_password": user["must_change_password"],
        }


def delete_user(email: str, requester_email: str):
    key = email.strip().lower()
    requester_key = requester_email.strip().lower()

    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            u = session.get(dbmod.User, key)
            if u is None:
                raise ValueError("User not found.")
            if key == requester_key:
                raise ValueError("You can't remove your own account.")
            admins_left = session.query(dbmod.User).filter(dbmod.User.role == "admin").count()
            if u.role == "admin" and admins_left <= 1:
                raise ValueError("Can't remove the last admin account.")
            session.delete(u)
            session.commit()
        finally:
            session.close()
        return

    with _lock:
        if key not in _data["users"]:
            raise ValueError("User not found.")
        if key == requester_key:
            raise ValueError("You can't remove your own account.")
        admins_left = sum(1 for u in _data["users"].values() if u["role"] == "admin")
        if _data["users"][key]["role"] == "admin" and admins_left <= 1:
            raise ValueError("Can't remove the last admin account.")
        del _data["users"][key]
        _save(_data)


def update_password(email: str, new_password: str):
    key = email.strip().lower()
    if len(new_password) < 10:
        raise ValueError("Password must be at least 10 characters.")

    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            u = session.get(dbmod.User, key)
            if u is None:
                raise ValueError("User not found.")
            u.hashed_password = hash_password(new_password)
            u.must_change_password = False
            session.commit()
        finally:
            session.close()
        return

    with _lock:
        if key not in _data["users"]:
            raise ValueError("User not found.")
        _data["users"][key]["hashed_password"] = hash_password(new_password)
        _data["users"][key]["must_change_password"] = False
        _save(_data)


def update_name(email: str, new_name: str) -> dict:
    key = email.strip().lower()
    new_name = new_name.strip()
    if not new_name:
        raise ValueError("Name can't be empty.")

    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            u = session.get(dbmod.User, key)
            if u is None:
                raise ValueError("User not found.")
            u.name = new_name
            session.commit()
            return _pg_to_public(u)
        finally:
            session.close()

    with _lock:
        if key not in _data["users"]:
            raise ValueError("User not found.")
        _data["users"][key]["name"] = new_name
        _save(_data)
        u = _data["users"][key]
        return {
            "id": u["id"],
            "email": u["email"],
            "name": u["name"],
            "role": u["role"],
            "must_change_password": u.get("must_change_password", False),
        }


# ── Chat history (admin "History" tab — everyone's Q&A log) ─────
CHAT_HISTORY: list = []  # only used by the JSON-file backend
_chat_id_counter = 1


def save_chat(user_email: str, user_name: str, query: str, answer: str):
    global _chat_id_counter

    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            row = dbmod.ChatLog(user_email=user_email, user_name=user_name, query=query, answer=answer)
            session.add(row)
            session.commit()
            session.refresh(row)
            return {
                "id": row.id, "user_email": row.user_email, "user_name": row.user_name,
                "query": row.query, "answer": row.answer, "timestamp": row.timestamp,
            }
        finally:
            session.close()

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
    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            q = session.query(dbmod.ChatLog)
            if role != "admin":
                q = q.filter(dbmod.ChatLog.user_email == user_email)
            rows = q.order_by(dbmod.ChatLog.timestamp.desc()).all()
            return [
                {
                    "id": r.id, "user_email": r.user_email, "user_name": r.user_name,
                    "query": r.query, "answer": r.answer, "timestamp": r.timestamp,
                }
                for r in rows
            ]
        finally:
            session.close()

    if role == "admin":
        return sorted(CHAT_HISTORY, key=lambda x: x["timestamp"], reverse=True)
    return sorted(
        [h for h in CHAT_HISTORY if h["user_email"] == user_email],
        key=lambda x: x["timestamp"],
        reverse=True,
    )
