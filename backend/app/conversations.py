"""
Server-side chat conversation storage — per-user, JSON-file-backed (same
pattern as usage.py / database.py). Replaces the old browser-localStorage
approach so a user's Recent/Favorites list is identical no matter which
browser or device they're signed in from.

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


def list_conversations(email: str) -> list:
    return _data.get(email.strip().lower(), [])


def save_conversations(email: str, conversations: list):
    key = email.strip().lower()
    with _lock:
        _data[key] = conversations
        _save(_data)
