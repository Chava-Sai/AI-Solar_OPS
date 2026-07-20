"""
Local embedding model — sentence-transformers/all-MiniLM-L6-v2, run via
fastembed (ONNX Runtime) instead of the PyTorch sentence-transformers library.

Why fastembed: identical model weights, numerically identical output
(verified cosine similarity = 1.0 against sentence-transformers), but without
the torch/transformers dependency stack — cuts backend RAM from >512MB to a
size that fits comfortably on free-tier hosting (Render free plan OOM'd at
512MB with the torch-based stack).

FREE · No API key · 384 dimensions · downloads ~90MB ONNX model on first run.
"""
import logging
from fastembed import TextEmbedding

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

logger.info(f"[Embedder] Loading model: {MODEL_NAME} (fastembed/ONNX, downloads on first run)")
_model = TextEmbedding(model_name=MODEL_NAME)
logger.info("[Embedder] Model ready")


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns list of float vectors."""
    if not texts:
        return []
    return [vec.tolist() for vec in _model.embed(texts, batch_size=32)]


def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    return next(_model.embed([query])).tolist()
