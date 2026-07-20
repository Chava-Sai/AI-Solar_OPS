"""
Full document ingestion pipeline:
File → Parse → Chunk → Embed → Store in ChromaDB
"""
import uuid
import logging
from pathlib import Path
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.ingestion.parsers import parse_document
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks, delete_document_chunks

logger = logging.getLogger(__name__)

# Chunking config
CHUNK_SIZE    = 800   # characters (~200 tokens for MiniLM)
CHUNK_OVERLAP = 100

splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def ingest_document(
    file_path: str,
    category: str = "General",
    client_name: str = "All Clients",
) -> dict:
    """
    Ingest a single document into ChromaDB.
    Returns a summary dict with status and stats.
    """
    path = Path(file_path)

    try:
        # 1. Parse raw text
        logger.info(f"[Ingestion] Parsing: {path.name}")
        raw_text = parse_document(file_path)

        if not raw_text.strip():
            return {"status": "error", "filename": path.name, "message": "No text extracted"}

        # 2. Split into chunks
        chunks = splitter.split_text(raw_text)
        logger.info(f"[Ingestion] {path.name} → {len(chunks)} chunks")

        # 3. Embed all chunks in one batch
        embeddings = embed_texts(chunks)

        # 4. Remove old chunks for this file (re-ingestion support)
        delete_document_chunks(path.name)

        # 5. Build records and store
        records = [
            {
                "id": f"{path.stem}_{i}_{uuid.uuid4().hex[:6]}",
                "text": chunk,
                "embedding": embedding,
                "metadata": {
                    "filename": path.name,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "category": category,
                    "client": client_name,
                    "file_type": path.suffix.lower(),
                },
            }
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]

        add_chunks(records)

        return {
            "status": "success",
            "filename": path.name,
            "chunks_created": len(chunks),
            "characters_parsed": len(raw_text),
            "category": category,
            "client": client_name,
        }

    except Exception as e:
        logger.error(f"[Ingestion] Failed for {path.name}: {e}")
        return {"status": "error", "filename": path.name, "message": str(e)}
