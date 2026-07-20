"""
ChromaDB vector store — persistent local storage.
All document embeddings live here.
"""
import os
import logging
import chromadb

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
COLLECTION_NAME = "sop_documents"

_client = chromadb.PersistentClient(path=CHROMA_PATH)


def _get_collection():
    return _client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks(records: list[dict]):
    """Add embedded chunks to ChromaDB."""
    if not records:
        return
    col = _get_collection()
    col.add(
        ids       = [r["id"] for r in records],
        documents = [r["text"] for r in records],
        embeddings= [r["embedding"] for r in records],
        metadatas = [r["metadata"] for r in records],
    )
    logger.info(f"[VectorStore] Added {len(records)} chunks")


def delete_document_chunks(filename: str):
    """Delete all existing chunks for a filename before re-ingesting."""
    col = _get_collection()
    try:
        col.delete(where={"filename": filename})
        logger.info(f"[VectorStore] Deleted old chunks for: {filename}")
    except Exception:
        pass  # collection empty or doc not found — fine


def search(
    query_embedding: list[float],
    n_results: int = 5,
    category: str = None,
    client: str = None,
) -> dict:
    """Semantic search — returns top-K relevant chunks."""
    col = _get_collection()

    # Build optional metadata filter
    where = {}
    if category and category != "All SOPs":
        where["category"] = category
    if client and client != "All Clients":
        where["client"] = client

    kwargs = dict(
        query_embeddings=[query_embedding],
        n_results=min(n_results, col.count() or 1),
        include=["documents", "metadatas", "distances"],
    )
    if where:
        kwargs["where"] = where

    return col.query(**kwargs)


def list_documents() -> list[dict]:
    """Return one entry per unique filename with chunk count."""
    col = _get_collection()
    if col.count() == 0:
        return []
    all_items = col.get(include=["metadatas"])
    seen = {}
    for meta in all_items["metadatas"]:
        fname = meta.get("filename", "unknown")
        if fname not in seen:
            seen[fname] = {
                "filename": fname,
                "category": meta.get("category", "General"),
                "client": meta.get("client", "All Clients"),
                "total_chunks": meta.get("total_chunks", 0),
                "file_type": meta.get("file_type", ""),
            }
    return list(seen.values())


def get_stats() -> dict:
    col = _get_collection()
    total_chunks = col.count()
    docs = list_documents()
    return {
        "total_documents": len(docs),
        "total_chunks": total_chunks,
        "documents": docs,
    }
