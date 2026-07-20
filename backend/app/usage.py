"""
Per-user, PER-MODEL daily usage limits — Groq free-tier budgeting for 30 users.

Groq free-plan limits are PER MODEL (each model has its own pool):
  openai/gpt-oss-120b : RPM 30 · RPD 1,000 · TPM 8,000 · TPD 200,000
  openai/gpt-oss-20b  : RPM 30 · RPD 1,000 · TPM 8,000 · TPD 200,000

Budget per user per model (÷ 30 users):
  tokens   : 200,000 / 30 ≈ 6,666 → 6,500 (safety buffer)
  requests : 1,000  / 30 ≈ 33    → 30

Sequential spending: users consume the 120B (quality) budget first; when it's
exhausted the system auto-switches to 20B and tells the user why. Users may
also manually pick a model. FAQ cache hits cost nothing and are only counted
for stats.

Counters persist to JSON and roll over at local midnight.
"""
import os
import json
import logging
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

USAGE_FILE = Path(os.getenv("USAGE_DATA_PATH", "./usage_data.json"))

# Model registry: key → Groq model id, label, per-user + global daily limits.
# Order = spend priority (best quality first; users burn budgets sequentially).
# Per-user limits = global free-tier limit ÷ 30 users, with a small buffer.
# Global RPD values verified live from x-ratelimit headers (2026-07);
# TPD values from Groq free-tier docs (not exposed in headers).
MODELS = {
    "gpt120": {
        "id": "openai/gpt-oss-120b", "label": "GPT-OSS 120B",
        "user_tokens": 6500, "user_requests": 30,          # 200k TPD / 1k RPD
        "global_tpd": 200_000, "global_rpd": 1_000,
    },
    "llama70": {
        "id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B",
        "user_tokens": 3200, "user_requests": 30,          # 100k TPD / 1k RPD
        "global_tpd": 100_000, "global_rpd": 1_000,
    },
    "gpt20": {
        "id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B",
        "user_tokens": 6500, "user_requests": 30,          # 200k TPD / 1k RPD
        "global_tpd": 200_000, "global_rpd": 1_000,
    },
    "llama8": {
        "id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B",
        "user_tokens": 16000, "user_requests": 480,        # 500k TPD / 14.4k RPD
        "global_tpd": 500_000, "global_rpd": 14_400,
    },
}
MODEL_ORDER = ["gpt120", "llama70", "gpt20", "llama8"]

_lock = threading.Lock()


def estimate_tokens(text: str) -> int:
    """Cheap token estimate (~4 chars/token for English)."""
    return max(1, len(text) // 4)


def _empty_model() -> dict:
    return {"tokens": 0, "requests": 0}


def _empty_user() -> dict:
    return {
        "models": {k: _empty_model() for k in MODEL_ORDER},
        "faq_hits": 0,
        "logins": 0,
        "last_active": None,
    }


def _load() -> dict:
    today = date.today().isoformat()
    if USAGE_FILE.exists():
        try:
            data = json.loads(USAGE_FILE.read_text())
            if data.get("date") == today and "users" in data:
                return data
        except Exception:
            pass
    return {"date": today, "users": {}}


def _save(data: dict):
    try:
        USAGE_FILE.write_text(json.dumps(data))
    except Exception as e:
        logger.error(f"[Usage] Failed to persist usage data: {e}")


def _user(data: dict, email: str) -> dict:
    u = data["users"].setdefault(email, _empty_user())
    # forward-compat: fill any missing keys (e.g. file written by older version)
    for k, v in _empty_user().items():
        u.setdefault(k, v)
    for m in MODEL_ORDER:
        u["models"].setdefault(m, _empty_model())
    return u


def _reset_info() -> dict:
    now = datetime.now()
    midnight = datetime.combine(now.date() + timedelta(days=1), datetime.min.time())
    secs = int((midnight - now).total_seconds())
    return {"resets_at": midnight.isoformat(), "resets_in_seconds": secs}


def _model_snapshot(mu: dict, key: str) -> dict:
    tok_limit = MODELS[key]["user_tokens"]
    req_limit = MODELS[key]["user_requests"]
    tok_pct = min(100, round(mu["tokens"] / tok_limit * 100))
    req_pct = min(100, round(mu["requests"] / req_limit * 100))
    return {
        "tokens_used": mu["tokens"],
        "tokens_limit": tok_limit,
        "requests_used": mu["requests"],
        "requests_limit": req_limit,
        "percent_used": max(tok_pct, req_pct),
        "exhausted": mu["tokens"] >= tok_limit or mu["requests"] >= req_limit,
    }


def get_usage(email: str) -> dict:
    """Full per-model snapshot for one user (powers the UI ring + popover)."""
    with _lock:
        data = _load()
        u = _user(data, email)
        models = {}
        for key in MODEL_ORDER:
            models[key] = {
                "label": MODELS[key]["label"],
                "model_id": MODELS[key]["id"],
                **_model_snapshot(u["models"][key], key),
            }
        total_used = sum(u["models"][k]["tokens"] for k in MODEL_ORDER)
        total_limit = sum(MODELS[k]["user_tokens"] for k in MODEL_ORDER)
        all_exhausted = all(models[k]["exhausted"] for k in MODEL_ORDER)
        return {
            "models": models,
            "model_order": MODEL_ORDER,
            "tokens_used_total": total_used,
            "tokens_limit_total": total_limit,
            "percent_used": min(100, round(
                max(models[k]["percent_used"] for k in MODEL_ORDER) if all_exhausted
                else total_used / total_limit * 100
            )),
            "faq_hits": u["faq_hits"],
            "limit_reached": all_exhausted,
            **_reset_info(),
        }


def choose_model(email: str, preferred: str | None = None) -> dict:
    """
    Decide which model this call should use.
      preferred: "primary" | "fallback" | None (auto)
    Returns {"key", "model_id", "label", "switched", "reason"} or
            {"key": None} when every budget is exhausted.
    """
    with _lock:
        data = _load()
        u = _user(data, email)

    def has_budget(key: str) -> bool:
        mu = u["models"][key]
        return (mu["tokens"] < MODELS[key]["user_tokens"]
                and mu["requests"] < MODELS[key]["user_requests"])

    # user explicitly picked a model and it still has budget
    if preferred in MODEL_ORDER and has_budget(preferred):
        return {"key": preferred, "model_id": MODELS[preferred]["id"],
                "label": MODELS[preferred]["label"], "switched": False, "reason": None}

    # auto (or preferred model exhausted): spend in priority order
    for key in MODEL_ORDER:
        if has_budget(key):
            switched = (preferred in MODEL_ORDER and preferred != key) or \
                       (preferred is None and key != MODEL_ORDER[0])
            reason = None
            if switched:
                missed = preferred if preferred in MODEL_ORDER else MODEL_ORDER[0]
                reason = f"{MODELS[missed]['label']} daily limit reached"
            return {"key": key, "model_id": MODELS[key]["id"],
                    "label": MODELS[key]["label"], "switched": switched, "reason": reason}

    return {"key": None, "model_id": None, "label": None, "switched": False,
            "reason": "All model budgets exhausted for today"}


def record_llm_call(email: str, model_key: str, prompt_text: str, completion_text: str,
                    exact_tokens: int | None = None) -> dict:
    """
    Record one Groq call against a specific model's budget.
    `exact_tokens` (from the Groq response `usage` field) is preferred;
    the chars/4 estimate is only the fallback when the stream didn't finish.
    """
    tokens = exact_tokens if exact_tokens else \
        estimate_tokens(prompt_text) + estimate_tokens(completion_text)
    with _lock:
        data = _load()
        u = _user(data, email)
        mu = u["models"].setdefault(model_key, _empty_model())
        mu["tokens"] += tokens
        mu["requests"] += 1
        u["last_active"] = datetime.now().isoformat()
        _save(data)
        lim = MODELS.get(model_key, {})
        logger.info(f"[Usage] {email} [{model_key}]: +{tokens} tok → "
                    f"{mu['tokens']}/{lim.get('user_tokens', '?')} tok, "
                    f"{mu['requests']}/{lim.get('user_requests', '?')} req")
    return get_usage(email)


def record_faq_hit(email: str) -> dict:
    """FAQ answers are free — tracked for stats only."""
    with _lock:
        data = _load()
        u = _user(data, email)
        u["faq_hits"] += 1
        u["last_active"] = datetime.now().isoformat()
        _save(data)
    return get_usage(email)


def record_login(email: str):
    with _lock:
        data = _load()
        u = _user(data, email)
        u["logins"] += 1
        u["last_active"] = datetime.now().isoformat()
        _save(data)


def get_admin_overview() -> dict:
    """Team-wide usage for the admin dashboard."""
    with _lock:
        data = _load()
        users_out = []
        global_models = {k: {"tokens": 0, "requests": 0} for k in MODEL_ORDER}

        for email, u in data["users"].items():
            for k, v in _empty_user().items():
                u.setdefault(k, v)
            per_model = {}
            for key in MODEL_ORDER:
                mu = u["models"].get(key, _empty_model())
                global_models[key]["tokens"] += mu["tokens"]
                global_models[key]["requests"] += mu["requests"]
                per_model[key] = _model_snapshot(mu, key)
            total = sum(u["models"].get(k, _empty_model())["tokens"] for k in MODEL_ORDER)
            total_limit = sum(MODELS[k]["user_tokens"] for k in MODEL_ORDER)
            users_out.append({
                "email": email,
                "models": per_model,
                "tokens_total": total,
                "percent_used": min(100, round(total / total_limit * 100)),
                "faq_hits": u["faq_hits"],
                "logins": u["logins"],
                "last_active": u["last_active"],
            })

        users_out.sort(key=lambda x: x["tokens_total"], reverse=True)

        models_out = {}
        for key in MODEL_ORDER:
            g = global_models[key]
            tpd = MODELS[key]["global_tpd"]
            rpd = MODELS[key]["global_rpd"]
            models_out[key] = {
                "label": MODELS[key]["label"],
                "model_id": MODELS[key]["id"],
                "tokens_used": g["tokens"],
                "tokens_limit": tpd,
                "tokens_percent": min(100, round(g["tokens"] / tpd * 100)),
                "requests_used": g["requests"],
                "requests_limit": rpd,
                "requests_percent": min(100, round(g["requests"] / rpd * 100)),
            }

        # live account state captured from Groq rate-limit headers
        from app.groq_meta import get_live
        live = get_live()
        for key in MODEL_ORDER:
            models_out[key]["groq_live"] = live.get(MODELS[key]["id"])

        return {
            "date": data["date"],
            "models": models_out,
            "model_order": MODEL_ORDER,
            "users": users_out,
            "active_users": len(users_out),
            "faq_hits_total": sum(x["faq_hits"] for x in users_out),
            "per_user_limits": {
                k: {"label": MODELS[k]["label"],
                    "tokens": MODELS[k]["user_tokens"],
                    "requests": MODELS[k]["user_requests"]}
                for k in MODEL_ORDER
            },
            **_reset_info(),
        }
