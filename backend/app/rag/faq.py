"""
FAQ semantic cache — answers common questions WITHOUT spending LLM tokens.

Flow:
  1. `build_faq_collection()` parses a Q&A document (Common Questionnaire.docx),
     embeds every QUESTION with the same local MiniLM model used for RAG, and
     stores question + canned answer in a dedicated Chroma collection.
  2. At chat time, `match_faq(query_embedding)` checks whether the user's
     question is semantically similar to a stored FAQ question (people phrase
     the same question many ways — cosine similarity handles that).
  3. On a hit, the stored answer is returned directly → zero Groq tokens.
     On a miss, the normal RAG + LLM pipeline runs.

Threshold is configurable: FAQ_SIM_THRESHOLD in .env (default 0.72).
Chroma stores cosine DISTANCE (= 1 - similarity), so hit ⇔ distance ≤ 1 - threshold.
"""
import os
import re
import logging

import chromadb

from app.rag.embedder import embed_texts

logger = logging.getLogger(__name__)

CHROMA_PATH    = os.getenv("CHROMA_DB_PATH", "./chroma_db")
FAQ_COLLECTION = "faq_cache"

_client = chromadb.PersistentClient(path=CHROMA_PATH)


def _get_collection():
    return _client.get_or_create_collection(
        name=FAQ_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )


def _sim_threshold() -> float:
    try:
        return float(os.getenv("FAQ_SIM_THRESHOLD", "0.72"))
    except ValueError:
        return 0.72


# ── Parsing ────────────────────────────────────────────────────────────────────
# Questions look like "4. How do you ..." or "🔹 17. How do you ..."
_QUESTION_RE = re.compile(r"^[^\w]*(\d{1,3})[\.\)]\s+(.+)$")

# First-person interview / HR questions — real ops users never ask these, and
# the stored answers are personal ("In my previous role..."), so skip them.
_HR_PATTERNS = re.compile(
    r"career goals|work independently|part of a team|prioritize multiple tasks"
    r"|stay updated with|describe your experience|strengths|weakness"
    r"|tell (?:me|us) about yourself|why (?:should we|do you want)|salary",
    re.IGNORECASE,
)


def parse_questionnaire(docx_path: str) -> list[dict]:
    """Extract {question, answer} pairs from the Common Questionnaire docx."""
    from docx import Document

    doc = Document(docx_path)
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

    pairs = []
    current_q = None
    answer_parts: list[str] = []
    in_answer = False

    def flush():
        nonlocal current_q, answer_parts, in_answer
        if current_q and answer_parts:
            pairs.append({
                "question": current_q,
                "answer": "\n".join(answer_parts).strip(),
            })
        current_q, answer_parts, in_answer = None, [], False

    for p in paras:
        m = _QUESTION_RE.match(p)
        if m:
            flush()
            current_q = m.group(2).strip()
            continue

        low = p.lower()
        if low == "answer" or low == "answer:":
            in_answer = True
            continue
        if low.startswith("answer:\n") or low.startswith("answer:"):
            in_answer = True
            body = p.split(":", 1)[1].strip()
            if body:
                answer_parts.append(body)
            continue

        if current_q and in_answer:
            answer_parts.append(p)
        # paragraphs before the first question (titles/section headers) are ignored

    flush()

    kept = [p for p in pairs if not _HR_PATTERNS.search(p["question"])]
    skipped = len(pairs) - len(kept)
    logger.info(f"[FAQ] Parsed {len(pairs)} Q&A pairs, kept {len(kept)} (skipped {skipped} HR/interview)")
    return kept


# ── Build / rebuild ────────────────────────────────────────────────────────────
def build_faq_collection(docx_path: str) -> dict:
    """(Re)build the FAQ cache collection from a questionnaire document."""
    pairs = parse_questionnaire(docx_path)
    if not pairs:
        return {"status": "error", "message": "No Q&A pairs found"}

    # Recreate the collection so removed/edited FAQs don't linger.
    try:
        _client.delete_collection(FAQ_COLLECTION)
    except Exception:
        pass
    col = _get_collection()

    questions = [p["question"] for p in pairs]
    embeddings = embed_texts(questions)

    col.add(
        ids=[f"faq_{i}" for i in range(len(pairs))],
        documents=questions,
        embeddings=embeddings,
        metadatas=[{"answer": p["answer"], "question": p["question"]} for p in pairs],
    )
    logger.info(f"[FAQ] Built cache with {len(pairs)} entries")
    return {"status": "success", "faq_count": len(pairs)}


# ── Matching ───────────────────────────────────────────────────────────────────
def match_faq(query_embedding: list[float]) -> dict | None:
    """
    Return {"question", "answer", "similarity"} when the user's query matches a
    cached FAQ closely enough, else None.
    """
    col = _get_collection()
    if col.count() == 0:
        return None

    res = col.query(
        query_embeddings=[query_embedding],
        n_results=1,
        include=["metadatas", "distances", "documents"],
    )
    distances = res.get("distances", [[]])[0]
    metadatas = res.get("metadatas", [[]])[0]
    if not distances:
        return None

    similarity = 1.0 - distances[0]
    if similarity >= _sim_threshold():
        meta = metadatas[0]
        logger.info(f"[FAQ] HIT (sim={similarity:.3f}): '{meta['question'][:60]}'")
        return {
            "question": meta["question"],
            "answer": meta["answer"],
            "similarity": round(similarity, 3),
        }

    logger.info(f"[FAQ] miss (best sim={similarity:.3f} < {_sim_threshold()})")
    return None


def faq_stats() -> dict:
    col = _get_collection()
    return {"faq_count": col.count(), "similarity_threshold": _sim_threshold()}
