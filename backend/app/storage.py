"""
Google Cloud Storage-backed durability for uploaded documents and the
ChromaDB vector index. Both currently live on Cloud Run's ephemeral disk —
a document an admin uploads at runtime (and its embeddings) is gone on the
next container restart, same failure mode already fixed for users/
conversations/usage via Postgres.

Set GCS_BUCKET_NAME to enable. Unset, everything behaves exactly as
before (local disk only) — same opt-in pattern as DATABASE_URL.
"""
import io
import logging
import os
import shutil
import tarfile
from pathlib import Path

logger = logging.getLogger(__name__)

GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
CHROMA_BACKUP_BLOB = "chroma-backup/chroma_db.tar.gz"
DOCUMENTS_PREFIX = "documents/"

_client = None


def is_enabled() -> bool:
    return bool(GCS_BUCKET_NAME)


def _bucket():
    global _client
    if _client is None:
        from google.cloud import storage
        _client = storage.Client()
    return _client.bucket(GCS_BUCKET_NAME)


def upload_document_file(local_path: Path, filename: str):
    """Push the raw uploaded file to GCS — the durable copy. The local disk
    copy is only needed transiently, to give the ingestion pipeline a real
    file path to parse."""
    if not is_enabled():
        return
    try:
        blob = _bucket().blob(DOCUMENTS_PREFIX + filename)
        blob.upload_from_filename(str(local_path))
        logger.info(f"[Storage] Uploaded {filename} to GCS")
    except Exception as e:
        logger.error(f"[Storage] Failed to upload {filename} to GCS: {e}")


def delete_document_file(filename: str):
    if not is_enabled():
        return
    try:
        _bucket().blob(DOCUMENTS_PREFIX + filename).delete()
        logger.info(f"[Storage] Deleted {filename} from GCS")
    except Exception as e:
        logger.warning(f"[Storage] Could not delete {filename} from GCS (may already be gone): {e}")


def backup_chroma_db(chroma_path: str):
    """Tar the whole ChromaDB directory and push it to GCS. Called after
    every ingestion/deletion so the next container boot can restore it."""
    if not is_enabled():
        return
    try:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(chroma_path, arcname=".")
        buf.seek(0)
        _bucket().blob(CHROMA_BACKUP_BLOB).upload_from_file(buf, content_type="application/gzip")
        logger.info("[Storage] ChromaDB backup uploaded to GCS")
    except Exception as e:
        logger.error(f"[Storage] Failed to back up ChromaDB to GCS: {e}")


def restore_chroma_backup_if_configured(chroma_path: str):
    """Called once at boot, before ChromaDB's PersistentClient touches disk —
    pulls the latest backup down so runtime-uploaded docs survive a restart.
    With no backup yet (first boot after enabling this), falls through to
    whatever chroma_db shipped baked into the image."""
    if not is_enabled():
        return
    try:
        blob = _bucket().blob(CHROMA_BACKUP_BLOB)
        if not blob.exists():
            logger.info("[Storage] No ChromaDB backup in GCS yet — starting from the image's baked-in snapshot")
            return
        buf = io.BytesIO()
        blob.download_to_file(buf)
        buf.seek(0)
        target = Path(chroma_path)
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            tar.extractall(target, filter="data")
        logger.info("[Storage] Restored ChromaDB from GCS backup")
    except Exception as e:
        logger.error(f"[Storage] Failed to restore ChromaDB from GCS, starting from the image's baked-in snapshot: {e}")
