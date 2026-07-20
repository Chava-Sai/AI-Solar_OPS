"""
Local embedding model — sentence-transformers all-MiniLM-L6-v2
FREE · No API key · 384 dimensions · Fast (~1000 chunks/sec on CPU)
Downloads ~80MB on first run.
"""
import logging
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"

logger.info(f"[Embedder] Loading model: {MODEL_NAME} (downloads on first run ~80MB)")
_model = SentenceTransformer(MODEL_NAME)
logger.info("[Embedder] Model ready")


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns list of float vectors."""
    if not texts:
        return []
    embeddings = _model.encode(texts, show_progress_bar=False, batch_size=32)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    return _model.encode([query], show_progress_bar=False)[0].tolist()
