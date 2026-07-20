"""
Chat router — real RAG pipeline with streaming (SSE) + non-streaming endpoints.

Query flow (token-saving design):
  1. Daily limit check   — user over budget → blocked (no Groq call)
  2. FAQ semantic cache  — similar question already answered → stored answer, 0 tokens
  3. RAG + LLM           — retrieval + Groq generation (counts against the budget)
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List

from app.schemas import ChatRequest, ChatResponse, SourceRef, ChatHistoryItem
from app.auth import get_current_user, require_role
from app.database import save_chat, get_history
from app.rag.chain import rag_query, retrieve_context
from app.rag.embedder import embed_query
from app.rag.faq import match_faq, faq_stats
from app.rag.llm import stream_llm_response, SYSTEM_PROMPT, build_prompt
from app.rag.vector_store import get_stats
from app import usage

logger = logging.getLogger(__name__)
router = APIRouter()

LIMIT_MESSAGE = (
    "**Daily AI limit reached.**\n\n"
    "You've used your full daily quota of AI-generated answers. "
    "Your limit resets at midnight.\n\n"
    "_Tip: many common questions are answered instantly from the FAQ cache "
    "and don't count against your quota — try rephrasing your question._"
)


def _sse(payload: dict) -> str:
    """Format a dict as a Server-Sent Events data frame."""
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/stream")
def stream_chat(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    """
    Streaming endpoint — emits SSE frames:
      {"type":"sources", "sources":[...]}          (once, first — empty on FAQ hits)
      {"type":"faq", "matched_question": "..."}     (only when the FAQ cache answers)
      {"type":"token", "text":"..."}                (many)
      {"type":"limit", "message":"..."}             (instead of tokens, when over budget)
      {"type":"usage", ...}                          (once, near the end)
      {"type":"done"}                                (once, last)
    """
    email = current_user["sub"]
    logger.info(f"[Chat] Stream from {email}: '{body.query[:60]}' (model={body.model or 'auto'})")

    # ── 1. FAQ semantic cache (free — allowed even when over the limit) ──
    query_vec = embed_query(body.query)
    faq_hit = match_faq(query_vec)

    # ── 2. Per-model budget: pick 120B first, auto-switch to 20B, honour
    #      the user's manual pick when it still has budget ────────────────
    choice = usage.choose_model(email, preferred=body.model)
    snap = usage.get_usage(email)

    def event_stream():
        full = []

        if faq_hit:
            yield _sse({"type": "sources", "sources": [
                {"document": "FAQ Knowledge Base", "page": "Cached answer", "section": "FAQ"},
            ]})
            yield _sse({"type": "faq",
                        "matched_question": faq_hit["question"],
                        "similarity": faq_hit["similarity"]})
            for word in faq_hit["answer"].split(" "):
                piece = word + " "
                full.append(piece)
                yield _sse({"type": "token", "text": piece})
            new_snap = usage.record_faq_hit(email)

        elif choice["key"] is None:
            yield _sse({"type": "sources", "sources": []})
            yield _sse({"type": "limit", "message": LIMIT_MESSAGE})
            for word in LIMIT_MESSAGE.split(" "):
                yield _sse({"type": "token", "text": word + " "})
            new_snap = snap

        else:
            # tell the UI which model is answering (and if we had to switch)
            yield _sse({"type": "model",
                        "key": choice["key"],
                        "label": choice["label"],
                        "switched": choice["switched"],
                        "reason": choice["reason"]})

            ret = retrieve_context(
                query=body.query,
                category=body.category_filter,
                client=body.client_filter,
                query_vec=query_vec,
            )
            yield _sse({"type": "sources", "sources": ret["sources"]})

            try:
                if ret["early_answer"] is not None:
                    for word in ret["early_answer"].split(" "):
                        piece = word + " "
                        full.append(piece)
                        yield _sse({"type": "token", "text": piece})
                    new_snap = snap  # no Groq call happened
                else:
                    exact = {}  # filled with real token counts from Groq's response
                    for piece in stream_llm_response(body.query, ret["context"],
                                                     model_id=choice["model_id"],
                                                     usage_out=exact):
                        full.append(piece)
                        yield _sse({"type": "token", "text": piece})
                    prompt_text = SYSTEM_PROMPT + build_prompt(body.query, ret["context"])
                    new_snap = usage.record_llm_call(email, choice["key"],
                                                     prompt_text, "".join(full),
                                                     exact_tokens=exact.get("total_tokens"))
            except Exception as e:
                logger.error(f"[Chat] Stream error: {e}")
                yield _sse({"type": "error", "message": "Generation failed. Please try again."})
                new_snap = snap

        answer = "".join(full).strip()
        if answer:
            save_chat(
                user_email=email,
                user_name=current_user["name"],
                query=body.query,
                answer=answer,
            )
        yield _sse({"type": "usage", **new_snap})
        yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/usage")
def my_usage(current_user: dict = Depends(get_current_user)):
    """Current user's per-model daily quota — powers the UI ring + popover."""
    return usage.get_usage(current_user["sub"])


@router.get("/admin/usage")
def admin_usage(current_user: dict = Depends(require_role("manager", "lead_analyst"))):
    """Team-wide model usage for the admin dashboard: global Groq budget
    consumption per model + per-user breakdown with logins/last-active."""
    from app.database import USERS
    overview = usage.get_admin_overview()
    # attach display names for known users
    for u in overview["users"]:
        rec = USERS.get(u["email"])
        u["name"] = rec["name"] if rec else u["email"].split("@")[0]
        u["role"] = rec["role"] if rec else "unknown"
    return overview


@router.post("/query", response_model=ChatResponse)
def query_chat(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    """Non-streaming endpoint (kept for compatibility / scripting)."""
    email = current_user["sub"]
    logger.info(f"[Chat] Query from {email}: '{body.query[:60]}'")

    # FAQ first — free
    query_vec = embed_query(body.query)
    faq_hit = match_faq(query_vec)
    if faq_hit:
        usage.record_faq_hit(email)
        record = save_chat(email, current_user["name"], body.query, faq_hit["answer"])
        return ChatResponse(
            answer=faq_hit["answer"],
            sources=[SourceRef(document="FAQ Knowledge Base", page="Cached answer", section="FAQ")],
            query=body.query,
            timestamp=record["timestamp"],
        )

    choice = usage.choose_model(email, preferred=body.model)
    if choice["key"] is None:
        raise HTTPException(429, "Daily AI limit reached on all models. Resets at midnight.")

    result = rag_query(
        query=body.query,
        category=body.category_filter,
        client=body.client_filter,
    )
    usage.record_llm_call(email, choice["key"], body.query, result["answer"])
    sources = [SourceRef(**s) for s in result["sources"]]
    record = save_chat(email, current_user["name"], body.query, result["answer"])
    return ChatResponse(
        answer=result["answer"],
        sources=sources,
        query=body.query,
        timestamp=record["timestamp"],
    )


@router.get("/history", response_model=List[ChatHistoryItem])
def chat_history(current_user: dict = Depends(get_current_user)):
    records = get_history(
        user_email=current_user["sub"],
        role=current_user["role"],
    )
    return [ChatHistoryItem(**r) for r in records]


@router.get("/stats")
def chat_stats(current_user: dict = Depends(get_current_user)):
    return {**get_stats(), "faq": faq_stats()}
