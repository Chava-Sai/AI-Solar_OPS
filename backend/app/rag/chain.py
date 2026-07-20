"""
RAG Chain — ties together retrieval + LLM generation.
This is the core of Astra AI.
"""
import logging
from app.rag.embedder   import embed_query
from app.rag.vector_store import search, get_stats
from app.rag.llm        import get_llm_response

logger = logging.getLogger(__name__)


def retrieve_context(
    query: str,
    category: str = None,
    client: str = None,
    n_results: int = 5,
    query_vec: list[float] | None = None,
) -> dict:
    """
    Retrieval half of the RAG pipeline (shared by the streaming + non-streaming
    endpoints). Returns:
      {
        "context": str,            # joined chunk text for the LLM
        "sources": [ {...}, ... ], # deduplicated source list for the UI
        "retrieved_chunks": int,
        "early_answer": str|None,  # set when we should skip the LLM entirely
      }
    """
    # No documents ingested at all.
    stats = get_stats()
    if stats["total_chunks"] == 0:
        return {
            "context": "",
            "sources": [],
            "retrieved_chunks": 0,
            "early_answer": (
                "No SOP documents have been ingested yet.\n\n"
                "Please ask your Admin to upload SOP documents via the Admin Panel. "
                "Once uploaded, I can answer questions from the actual AGS knowledge base."
            ),
        }

    # 1. Embed the query (skip if the caller already embedded it, e.g. for the
    #    FAQ-cache check — one embedding serves both lookups)
    if query_vec is None:
        query_vec = embed_query(query)
        logger.info(f"[RAG] Query embedded: '{query[:60]}...'")

    # 2. Retrieve relevant chunks
    results = search(
        query_embedding=query_vec,
        n_results=n_results,
        category=category,
        client=client,
    )
    chunks    = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas",  [[]])[0]
    distances = results.get("distances",  [[]])[0]

    if not chunks:
        return {
            "context": "",
            "sources": [],
            "retrieved_chunks": 0,
            "early_answer": (
                f"I couldn't find anything relevant for **{query}** in the SOP "
                f"knowledge base.\n\nTry rephrasing, or check that a relevant SOP "
                f"has been uploaded."
            ),
        }

    logger.info(f"[RAG] Retrieved {len(chunks)} chunks (best distance: {distances[0]:.3f})")

    # 3. Smart context selection — biggest token saver in the pipeline.
    # Instead of always sending all retrieved chunks (~1,000 tokens), keep a
    # chunk only while it is nearly as relevant as the best match, within a
    # hard character budget. Simple questions end up with 1-2 chunks.
    MAX_CONTEXT_CHARS = 3200   # ~800 tokens ceiling
    DIST_MARGIN       = 0.15   # drop chunks clearly worse than the best match
    MIN_CHUNKS        = 2      # always keep at least two for grounding

    best = distances[0]
    sel_chunks, sel_metas, total = [], [], 0
    for chunk, meta, dist in zip(chunks, metadatas, distances):
        if len(sel_chunks) >= MIN_CHUNKS and dist > best + DIST_MARGIN:
            break
        if sel_chunks and total + len(chunk) > MAX_CONTEXT_CHARS:
            break
        sel_chunks.append(chunk)
        sel_metas.append(meta)
        total += len(chunk)

    logger.info(f"[RAG] Context: {len(sel_chunks)}/{len(chunks)} chunks, {total} chars")

    # No "[Source N — Chunk]" labels here on purpose — the LLM tends to parrot
    # them into the answer. Sources are returned separately and the UI renders
    # them as clean chips beneath the answer.
    context = "\n\n---\n\n".join(sel_chunks)

    # 4. Deduplicated source list (by filename) for citation chips — only for
    # the chunks actually sent to the model.
    seen, sources = set(), []
    for meta in sel_metas:
        fname = meta.get("filename", "Unknown")
        if fname not in seen:
            seen.add(fname)
            sources.append({
                "document": fname,
                "page": f"Chunk {meta.get('chunk_index', 0) + 1} of {meta.get('total_chunks', '?')}",
                "section": meta.get("category", "SOP Document"),
            })

    return {
        "context": context,
        "sources": sources,
        "retrieved_chunks": len(chunks),
        "early_answer": None,
    }


def rag_query(
    query: str,
    category: str = None,
    client: str = None,
    n_results: int = 5,
) -> dict:
    """Non-streaming full pipeline: retrieve → generate → return answer + sources."""
    ret = retrieve_context(query, category, client, n_results)

    if ret["early_answer"] is not None:
        return {
            "answer": ret["early_answer"],
            "sources": ret["sources"],
            "retrieved_chunks": ret["retrieved_chunks"],
        }

    answer = get_llm_response(query, ret["context"])
    return {
        "answer": answer,
        "sources": ret["sources"],
        "retrieved_chunks": ret["retrieved_chunks"],
    }
