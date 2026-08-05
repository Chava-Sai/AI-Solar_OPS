"""
Server-side chat conversation storage — per-user. Two backends behind the
same two functions:
  - DATABASE_URL set    -> Postgres (Cloud SQL in production).
  - DATABASE_URL unset  -> JSON file, same as before.

Replaces the old browser-localStorage approach so a user's Recent/Favorites
list is identical no matter which browser or device they're signed in from.

The client still computes the full trimmed list (recent-10 FIFO, favorites-5
cap, rename/favorite toggling) exactly as it did with localStorage — this
module just persists whatever list it's given, scoped to the authenticated
user's email server-side (the client never gets to write another user's
bucket, regardless of what's in the payload).
"""
import os
import json
import logging
import threading
from pathlib import Path

from app import db as dbmod

logger = logging.getLogger(__name__)

CONVERSATIONS_FILE = Path(os.getenv("CONVERSATIONS_DATA_PATH", "./conversations_data.json"))
_lock = threading.Lock()


def _load() -> dict:
    if CONVERSATIONS_FILE.exists():
        try:
            data = json.loads(CONVERSATIONS_FILE.read_text())
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def _save(data: dict):
    try:
        CONVERSATIONS_FILE.write_text(json.dumps(data))
    except Exception as e:
        logger.error(f"[Conversations] Failed to persist: {e}")


_data = _load()

if dbmod.is_enabled():
    dbmod.init_db()


def list_conversations(email: str) -> list:
    key = email.strip().lower()
    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            bucket = session.get(dbmod.ConversationBucket, key)
            return bucket.conversations if bucket else []
        finally:
            session.close()
    return _data.get(key, [])


def save_conversations(email: str, conversations: list):
    key = email.strip().lower()

    if dbmod.is_enabled():
        session = dbmod.get_session()
        try:
            bucket = session.get(dbmod.ConversationBucket, key)
            if bucket is None:
                bucket = dbmod.ConversationBucket(user_email=key, conversations=conversations)
                session.add(bucket)
            else:
                bucket.conversations = conversations
            session.commit()
        finally:
            session.close()
        return

    with _lock:
        _data[key] = conversations
        _save(_data)
