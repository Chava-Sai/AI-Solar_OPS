"""
Live Groq account state, captured from rate-limit headers on every real call.

Groq exposes (per model, per API key):
  x-ratelimit-limit-requests / remaining-requests  → RPD (1,000/day) — REAL daily state
  x-ratelimit-limit-tokens   / remaining-tokens    → TPM (8,000/min) — rolling minute window

Note: daily TOKEN totals (TPD 200k) are NOT exposed by Groq headers or any
public API — the console usage page has no API. Daily tokens are therefore
tracked locally in app.usage, now with EXACT per-call counts taken from the
response `usage` field instead of estimates.
"""
import threading
from datetime import datetime

_lock = threading.Lock()
_live: dict[str, dict] = {}   # model_id → header snapshot


def capture_headers(model_id: str, headers) -> None:
    """Store the rate-limit headers from a Groq response."""
    try:
        snap = {
            "requests_limit": int(headers.get("x-ratelimit-limit-requests", 0)),
            "requests_remaining": int(headers.get("x-ratelimit-remaining-requests", 0)),
            "tpm_limit": int(headers.get("x-ratelimit-limit-tokens", 0)),
            "tpm_remaining": int(headers.get("x-ratelimit-remaining-tokens", 0)),
            "captured_at": datetime.now().isoformat(),
        }
    except (TypeError, ValueError):
        return
    with _lock:
        _live[model_id] = snap


def get_live() -> dict[str, dict]:
    with _lock:
        return dict(_live)
