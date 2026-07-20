# Astra AI — SolarOps AI Assistant

Internal RAG chatbot for AGS / Clean Leaf solar monitoring engineers. Ask SOP
questions in natural language and get step-by-step answers with source citations.

**Stack:** FastAPI · ChromaDB · `all-MiniLM-L6-v2` local embeddings (free) ·
Groq Llama 3.3 70B (free LLM) · React + Vite frontend.

---

## 1. One-time setup of the LLM (required for AI answers)

The retrieval engine works without any key, but it just returns raw SOP text.
To get real AI-synthesized answers, add a **free** Groq key:

1. Go to <https://console.groq.com/keys> and create a key (free, no card).
2. Open `backend/.env` and uncomment / set:
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```
3. Restart the backend.

Default model is `llama-3.3-70b-versatile` with `llama-3.1-8b-instant` as
automatic fallback. Override via `GROQ_MODEL` in `.env` if needed.

---

## 2. Run the backend

```bash
cd backend
source venv/bin/activate          # venv already created
pip install -r requirements.txt   # first time only
uvicorn main:app --reload --port 8000
```
API docs: <http://localhost:8000/docs> · Health: <http://localhost:8000/health>

## 3. Run the frontend

```bash
cd frontend
npm install                       # first time only
npm run dev
```
Open <http://localhost:5173>.

### Demo logins (password `astra2026`)
| Role         | Email             | Can do                         |
|--------------|-------------------|--------------------------------|
| Manager      | manager@ags.com   | Chat + upload + delete + all history |
| Lead Analyst | lead@ags.com      | Chat + upload + all history     |
| Solar Analyst| analyst@ags.com   | Chat + own history              |

---

## 4. Knowledge base

10 real Clean Leaf SOPs are already ingested (86 chunks) across categories:
**Case Creation · Alerts · Aerial · Scheduling · Ops Review · Reports**.

To add/replace documents: log in as Manager or Lead → **Admin Panel** → upload
(PDF, DOCX, XLSX, PPTX, TXT). Files are parsed, chunked, embedded, and stored
automatically. To re-ingest from scratch from the command line:

```bash
cd backend
PYTHONPATH=. ./venv/bin/python -c "from app.ingestion.pipeline import ingest_document; ingest_document('../data/sop-documents/Ops Review.docx', category='Ops Review', client_name='Clean Leaf')"
```

---

## Architecture

```
React UI  →  FastAPI (/api)  →  RAG chain
                                  ├─ embed query   (MiniLM, local)
                                  ├─ search         (ChromaDB, cosine)
                                  └─ generate       (Groq Llama 3.3 70B)
                              →  answer + source citations
```
Key files: `backend/app/rag/chain.py` (orchestration),
`backend/app/rag/llm.py` (LLM providers), `backend/app/ingestion/pipeline.py`
(parse→chunk→embed→store).
