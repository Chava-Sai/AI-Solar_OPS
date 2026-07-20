import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.config import settings
from app.routers.auth_router import router as auth_router
from app.routers.chat_router import router as chat_router
from app.routers.docs_router import router as docs_router

app = FastAPI(
    title=settings.APP_NAME,
    description="Internal RAG-based AI chatbot for solar monitoring engineers — AGS",
    version=settings.VERSION,
)

# Local dev origins are always allowed; add production frontend origins via
# ALLOWED_ORIGINS in the environment (comma-separated), e.g. your Vercel URL.
_default_origins = ["http://localhost:5173", "http://localhost:3000"]
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _log_knowledge_base_state():
    """
    The vector DB (backend/chroma_db) ships pre-built and committed to the
    repo — SOPs, technical books, and the FAQ cache are already indexed, so
    no re-ingestion runs at boot (the source PDFs aren't even deployed).
    This just logs what's live, and warns loudly if the DB came up empty
    (e.g. .gitignore accidentally excluded chroma_db on this deploy).
    """
    import logging
    logger = logging.getLogger("astra.startup")
    try:
        from app.rag.vector_store import get_stats
        from app.rag.faq import faq_stats
        stats = get_stats()
        faq = faq_stats()
        if stats["total_chunks"] == 0:
            logger.warning("[Startup] Knowledge base is EMPTY — chroma_db was not deployed with the app.")
        else:
            logger.info(f"[Startup] Knowledge base ready: {stats['total_documents']} documents, "
                        f"{stats['total_chunks']} chunks, {faq['faq_count']} FAQ entries.")
    except Exception as e:
        logger.error(f"[Startup] Could not read knowledge base state: {e}")

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
app.include_router(docs_router, prefix="/api/docs", tags=["Documents"])


@app.get("/health", tags=["Health"])
def health():
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.VERSION,
    }
