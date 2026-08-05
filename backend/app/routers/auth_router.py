import os
import threading
import time
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.schemas import ChangePasswordRequest, LoginRequest, TokenResponse, UpdateNameRequest
from app.database import get_user, update_password, update_name
from app.auth import (
    create_access_token,
    get_authenticated_user,
    get_current_user,
    hash_password,
    verify_password,
)
from app.usage import record_login

router = APIRouter()

LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_RATE_WINDOW_SECONDS", "900"))
LOGIN_EMAIL_LIMIT = int(os.getenv("LOGIN_EMAIL_ATTEMPT_LIMIT", "5"))
LOGIN_IP_LIMIT = int(os.getenv("LOGIN_IP_ATTEMPT_LIMIT", "20"))
LOGIN_MIN_RESPONSE_SECONDS = float(os.getenv("LOGIN_MIN_RESPONSE_SECONDS", "0.4"))

_dummy_password_hash = hash_password("not-a-real-astra-password")
_login_failures = {"email": {}, "ip": {}}
_login_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _prune_attempts(attempts: deque, now: float):
    cutoff = now - LOGIN_WINDOW_SECONDS
    while attempts and attempts[0] <= cutoff:
        attempts.popleft()


def _cleanup_stale_attempts(now: float):
    for bucket in _login_failures.values():
        for key, attempts in list(bucket.items()):
            _prune_attempts(attempts, now)
            if not attempts:
                bucket.pop(key, None)


def _rate_limit_state(email: str, ip: str, now: float) -> tuple[bool, int]:
    with _login_lock:
        _cleanup_stale_attempts(now)
        checks = (
            ("email", email, LOGIN_EMAIL_LIMIT),
            ("ip", ip, LOGIN_IP_LIMIT),
        )
        retry_after = 0
        blocked = False
        for bucket, key, limit in checks:
            attempts = _login_failures[bucket].setdefault(key, deque())
            _prune_attempts(attempts, now)
            if len(attempts) >= limit:
                blocked = True
                retry_after = max(retry_after, int(LOGIN_WINDOW_SECONDS - (now - attempts[0])) + 1)
        return blocked, retry_after


def _record_login_failure(email: str, ip: str, now: float):
    with _login_lock:
        _cleanup_stale_attempts(now)
        for bucket, key in (("email", email), ("ip", ip)):
            attempts = _login_failures[bucket].setdefault(key, deque())
            _prune_attempts(attempts, now)
            attempts.append(now)


def _clear_login_failures(email: str):
    with _login_lock:
        _login_failures["email"].pop(email, None)


def _token_payload(user: dict) -> dict:
    return {
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "id": user["id"],
        "must_change_password": user.get("must_change_password", False),
    }


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "must_change_password": user.get("must_change_password", False),
    }

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request):
    started = time.monotonic()
    email_key = body.email.strip().lower()
    ip = _client_ip(request)
    blocked, retry_after = _rate_limit_state(email_key, ip, started)

    user = get_user(body.email)
    password_valid = verify_password(
        body.password,
        user["hashed_password"] if user else _dummy_password_hash,
    )
    remaining = LOGIN_MIN_RESPONSE_SECONDS - (time.monotonic() - started)
    if remaining > 0:
        time.sleep(remaining)

    if blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if not user or not password_valid:
        _record_login_failure(email_key, ip, time.monotonic())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    _clear_login_failures(email_key)
    record_login(user["email"])
    token = create_access_token(_token_payload(user))
    return TokenResponse(
        access_token=token,
        user=_public_user(user),
    )

@router.get("/me")
def get_me(current_user: dict = Depends(get_authenticated_user)):
    return current_user

@router.post("/change-password")
def change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_authenticated_user)):
    user = get_user(current_user["sub"])
    if not user or not verify_password(body.current_password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    if len(body.new_password) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 10 characters",
        )
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )
    update_password(user["email"], body.new_password)
    updated = get_user(user["email"])
    return TokenResponse(
        access_token=create_access_token(_token_payload(updated)),
        user=_public_user(updated),
    )

@router.put("/profile")
def update_profile(body: UpdateNameRequest, current_user: dict = Depends(get_current_user)):
    """Change display name only — email is the login identity and can't change here."""
    try:
        updated = update_name(current_user["sub"], body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Re-issue the token so its embedded "name" claim doesn't go stale until
    # the next login (chat history, etc. read the name straight off the JWT).
    token = create_access_token(_token_payload(updated))
    return TokenResponse(access_token=token, user=_public_user(updated))
