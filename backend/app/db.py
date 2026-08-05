"""
Postgres persistence layer (Cloud SQL in production).

Set DATABASE_URL to switch database.py / conversations.py / usage.py over to
Postgres. Unset, they keep using the original JSON-file behavior — local dev
and the test suite don't require a running Postgres instance.

Schema is deliberately a thin, pragmatic slice of docs/astra-schema.dbml: one
row per logical JSON blob the app already reads/writes as a whole (a user's
conversation list, a user's usage-for-one-day), not a fully normalized model.
That mirrors current read/write patterns exactly (e.g. PUT /conversations
already replaces the whole list) and is the minimum schema that survives a
container restart. The richer normalized schema in astra-schema.dbml (message
-level rows, revocable sessions, a documents table) is future scope, not
required to fix the data-loss bug this addresses.
"""
import os

from sqlalchemy import create_engine, Column, String, Boolean, Integer, Text, DateTime, Date, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

DATABASE_URL = os.getenv("DATABASE_URL")

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    email = Column(String, primary_key=True)  # lowercased, the login identifier
    id = Column(Integer, unique=True, nullable=False)
    display_email = Column(String, nullable=False)  # original casing, shown in the UI
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    must_change_password = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserIdSeq(Base):
    """A single-row counter standing in for the old JSON file's next_id."""
    __tablename__ = "user_id_seq"

    id = Column(Integer, primary_key=True)
    next_id = Column(Integer, nullable=False)


class ConversationBucket(Base):
    __tablename__ = "conversation_buckets"

    user_email = Column(String, primary_key=True)
    conversations = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class UsageDaily(Base):
    __tablename__ = "usage_daily"

    user_email = Column(String, primary_key=True)
    usage_date = Column(Date, primary_key=True)
    data = Column(JSON, nullable=False)  # {"models": {...}, "faq_hits": int, "logins": int, "last_active": str|None}


class ChatLog(Base):
    __tablename__ = "chat_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String, nullable=False, index=True)
    user_name = Column(String, nullable=False)
    query = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LoginFailure(Base):
    """
    One row per failed login attempt, bucketed by email or by IP. In-memory
    rate limiting only works because Cloud Run currently runs a single
    instance (min/max instances = 1) — the moment it scales past that, each
    instance would keep its own counters and an attacker could just get
    load-balanced around the limit. This table is the shared state that
    fixes that, whenever DATABASE_URL is set.
    """
    __tablename__ = "login_failures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bucket = Column(String, nullable=False, index=True)  # "email" | "ip"
    key = Column(String, nullable=False, index=True)
    attempted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


_engine = None
_SessionLocal = None


def is_enabled() -> bool:
    return bool(DATABASE_URL)


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    return _engine


def get_session():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal()


def init_db():
    """Create tables that don't exist yet. Safe to call on every boot."""
    Base.metadata.create_all(get_engine())
