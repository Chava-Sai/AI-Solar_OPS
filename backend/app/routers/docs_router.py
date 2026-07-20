"""
Document management endpoints.
Upload → Ingest → List → Delete
"""
import os
import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.auth import get_current_user, require_role
from app.rag.vector_store import get_stats, delete_document_chunks
from app.ingestion.parsers import SUPPORTED_FORMATS

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = Path(os.getenv("DOCS_UPLOAD_PATH", "../data/sop-documents")).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Track ingestion jobs in memory (use DB in production)
_ingestion_jobs: dict[str, dict] = {}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("General"),
    client_name: str = Form("All Clients"),
    current_user: dict = Depends(require_role("manager", "lead_analyst")),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(400, f"Unsupported format '{ext}'. Use: {SUPPORTED_FORMATS}")

    # Save file
    save_path = UPLOAD_DIR / file.filename
    content = await file.read()
    save_path.write_bytes(content)

    # Start ingestion in background
    job_id = file.filename
    _ingestion_jobs[job_id] = {"status": "ingesting", "filename": file.filename}

    asyncio.create_task(_run_ingestion(str(save_path), category, client_name, job_id))

    return {"message": "Upload received. Ingestion started.", "job_id": job_id, "filename": file.filename}


async def _run_ingestion(file_path: str, category: str, client_name: str, job_id: str):
    """Background task — runs ingestion pipeline."""
    try:
        loop = asyncio.get_event_loop()
        # Run CPU-bound ingestion in thread pool
        from app.ingestion.pipeline import ingest_document
        result = await loop.run_in_executor(None, ingest_document, file_path, category, client_name)
        _ingestion_jobs[job_id] = result
        logger.info(f"[Docs] Ingestion complete: {result}")
    except Exception as e:
        _ingestion_jobs[job_id] = {"status": "error", "message": str(e)}
        logger.error(f"[Docs] Ingestion failed: {e}")


@router.get("/status/{job_id}")
def ingestion_status(job_id: str, current_user: dict = Depends(get_current_user)):
    job = _ingestion_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/list")
def list_documents(current_user: dict = Depends(get_current_user)):
    return get_stats()


@router.delete("/{filename}")
def delete_document(
    filename: str,
    current_user: dict = Depends(require_role("manager")),
):
    # Remove from vector store
    delete_document_chunks(filename)
    # Remove file if it exists
    file_path = UPLOAD_DIR / filename
    if file_path.exists():
        file_path.unlink()
    return {"message": f"'{filename}' deleted successfully"}
