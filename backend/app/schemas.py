from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ── Auth ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ── Admin: user management ─────────────────────────────
class CreateUserRequest(BaseModel):
    email: str
    name: Optional[str] = None
    password: str
    role: str

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str

# ── Server-side chat conversations (Recent + Favorites) ─
class ConversationsPayload(BaseModel):
    conversations: List[dict]

# ── Chat ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str
    client_filter: Optional[str] = None   # filter by client SOP namespace
    category_filter: Optional[str] = None # filter by SOP category
    model: Optional[str] = None           # "primary" | "fallback" | None = auto

class SourceRef(BaseModel):
    document: str
    page: str
    section: str

class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceRef]
    query: str
    timestamp: datetime

class ChatHistoryItem(BaseModel):
    id: int
    query: str
    answer: str
    user_email: str
    user_name: str
    timestamp: datetime
