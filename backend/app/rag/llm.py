"""
LLM abstraction layer.
Priority: OpenAI → Groq → Chunk-based fallback (no key needed)

To activate (recommended = Groq, free + fast):
  Groq   → add GROQ_API_KEY=gsk_... to .env   (free key from https://console.groq.com)
  OpenAI → add OPENAI_API_KEY=sk-...  to .env

Model names are configurable via .env:
  GROQ_MODEL=openai/gpt-oss-120b        (default — current Groq recommended replacement)
  GROQ_FALLBACK_MODEL=openai/gpt-oss-20b
  OPENAI_MODEL=gpt-4o-mini
"""
import os
import logging

logger = logging.getLogger(__name__)

# Current Groq production models. The older llama-3.3-70b-versatile and
# llama-3.1-8b-instant IDs are deprecated by Groq. GPT-OSS 120B is the main
# quality model; GPT-OSS 20B is a cheaper fallback for rate-limit/cost control.
GROQ_MODEL          = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")
OPENAI_MODEL        = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Compact system prompt (~160 tokens vs ~450 before) — same rules, fewer tokens.
SYSTEM_PROMPT = """You are Astra AI, internal assistant for AGS solar monitoring engineers. Answer using ONLY the reference material provided.

- Complete but concise; prefer under ~250 words unless a procedure needs more.
- Procedures: numbered steps with concrete details (statuses, thresholds, emails, templates).
- Plain professional language; clean markdown; no HTML tags; no tables for procedures — use short labeled bullets ("**Priority:** ...").
- NEVER mention sources, chunks, file names, or the reference material itself — the app shows sources separately.
- If the material lacks the answer, say so in one sentence; never invent procedures, formulas, thresholds, or escalations.
- Reproduce formulas/templates exactly, then explain each part."""


def build_prompt(query: str, context: str) -> str:
    return f"""Reference material:
---
{context}
---

Question: {query}

Answer from the reference material only. Number the steps if a procedure applies. Do not mention sources or files."""


def get_llm_response(query: str, context: str) -> str:
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    groq_key   = os.getenv("GROQ_API_KEY", "").strip()

    if openai_key:
        logger.info(f"[LLM] Using OpenAI {OPENAI_MODEL}")
        try:
            return _openai_response(query, context, openai_key)
        except Exception as e:
            logger.error(f"[LLM] OpenAI failed: {e}")

    if groq_key:
        logger.info(f"[LLM] Using Groq {GROQ_MODEL}")
        try:
            return _groq_response(query, context, groq_key)
        except Exception as e:
            logger.error(f"[LLM] Groq failed: {e} — using retrieval fallback")

    logger.info("[LLM] No API key — using retrieval-based response")
    return _retrieval_response(query, context)


# ── OpenAI ────────────────────────────────────────────────────────────────────
def _openai_response(query: str, context: str, api_key: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": build_prompt(query, context)},
        ],
        max_tokens=1024,
        temperature=0.2,
    )
    return resp.choices[0].message.content


# ── Groq (free, fast Llama) ───────────────────────────────────────────────────
def _groq_response(query: str, context: str, api_key: str) -> str:
    from groq import Groq
    client = Groq(api_key=api_key)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": build_prompt(query, context)},
    ]
    for model in (GROQ_MODEL, GROQ_FALLBACK_MODEL):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=1024,
                temperature=0.2,
            )
            return resp.choices[0].message.content
        except Exception as e:
            logger.warning(f"[LLM] Groq model '{model}' failed: {e}")
            continue
    raise RuntimeError("All Groq models failed")


# ── Fallback — direct retrieval display ───────────────────────────────────────
def _retrieval_response(query: str, context: str) -> str:
    if not context.strip():
        return (
            "No relevant SOP documents found for your query.\n\n"
            "Please ensure SOP documents have been uploaded in the Admin Panel."
        )
    return (
        f"**Retrieved from the AGS SOP knowledge base** "
        f"_(add a free `GROQ_API_KEY` to `.env` for AI-synthesized answers)_:\n\n"
        f"{context}"
    )


# ── Streaming variants (token-by-token, ChatGPT/Claude style) ──────────────────
def stream_llm_response(query: str, context: str, model_id: str | None = None,
                        usage_out: dict | None = None):
    """
    Yield the answer incrementally as text fragments.
    When `model_id` is given (budget-managed flow), only that Groq model is
    used — the per-user budget layer decides switching, not this function.
    `usage_out`, when provided, is filled with EXACT token counts from the
    Groq response (prompt_tokens/completion_tokens/total_tokens).
    """
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    groq_key   = os.getenv("GROQ_API_KEY", "").strip()

    if openai_key and model_id is None:
        try:
            yield from _openai_stream(query, context, openai_key)
            return
        except Exception as e:
            logger.error(f"[LLM] OpenAI stream failed: {e}")

    if groq_key:
        try:
            yield from _groq_stream(query, context, groq_key, model_id=model_id,
                                    usage_out=usage_out)
            return
        except Exception as e:
            logger.error(f"[LLM] Groq stream failed: {e} — using retrieval fallback")

    # No key (or both failed) — emit the retrieval fallback in small pieces so
    # the UI still animates.
    text = _retrieval_response(query, context)
    for word in text.split(" "):
        yield word + " "


def _openai_stream(query: str, context: str, api_key: str):
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    stream = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": build_prompt(query, context)},
        ],
        max_tokens=1024,
        temperature=0.2,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def _groq_stream(query: str, context: str, api_key: str, model_id: str | None = None,
                 usage_out: dict | None = None):
    from groq import Groq
    from app.groq_meta import capture_headers
    client = Groq(api_key=api_key)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": build_prompt(query, context)},
    ]
    last_err = None
    candidates = (model_id,) if model_id else (GROQ_MODEL, GROQ_FALLBACK_MODEL)
    for model in candidates:
        try:
            kwargs = dict(
                model=model,
                messages=messages,
                max_tokens=700,       # answers rarely need more; caps output spend
                temperature=0.2,
                stream=True,
            )
            # gpt-oss models burn hidden reasoning tokens — keep that minimal
            if model.startswith("openai/gpt-oss"):
                kwargs["reasoning_effort"] = "low"
            # raw response → real rate-limit headers (live account state)
            raw = client.chat.completions.with_raw_response.create(**kwargs)
            capture_headers(model, raw.headers)
            stream = raw.parse()

            last_chunk = None
            for chunk in stream:
                last_chunk = chunk
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

            # exact token accounting from the final chunk
            if usage_out is not None and last_chunk is not None:
                u = getattr(getattr(last_chunk, "x_groq", None), "usage", None)
                if u:
                    usage_out.update({
                        "prompt_tokens": u.prompt_tokens,
                        "completion_tokens": u.completion_tokens,
                        "total_tokens": u.total_tokens,
                    })
            return
        except Exception as e:
            logger.warning(f"[LLM] Groq stream model '{model}' failed: {e}")
            last_err = e
            continue
    raise RuntimeError(f"All Groq stream models failed: {last_err}")
