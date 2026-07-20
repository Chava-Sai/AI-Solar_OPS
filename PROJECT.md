# Astra AI — SolarOps AI Assistant
### Project Documentation

**Organization:** American Green Solutions (AGS) / Clean Leaf Energy
**Type:** Internal RAG-based AI chatbot for solar monitoring & O&M engineers
**Status:** Working MVP (10 real SOPs ingested, live streaming chat)

---

## 1. Project Description

**Astra AI – SolarOps AI Assistant** is an internal, AI-powered chatbot that lets solar
monitoring engineers and O&M (Operations & Maintenance) teams get instant, accurate
answers to operational questions in plain English — instead of digging through scattered
PDFs, Word docs, spreadsheets, and emails.

Engineers simply ask questions like:

- *"How do I create a reactive case in Softwrench?"*
- *"What are the steps to notify an issue on an AES site?"*
- *"When does a case qualify for Ops Review?"*
- *"How are solar plant alerts categorized?"*
- *"Walk me through the aerial inspection procedure."*

The assistant reads the company's actual **Standard Operating Procedures (SOPs)** and
replies with a clear, step-by-step answer — complete with the concrete details
(case statuses, priority thresholds, email templates, escalation paths) and a list of the
source documents it used.

### The Problem
In monitoring operations today:
- SOPs are scattered across PDFs, SharePoint, emails, and Excel files.
- New engineers need long training periods and lean heavily on senior staff.
- Troubleshooting consistency varies across shifts.
- Critical procedures are hard to find quickly during a live incident.

This drives up **MTTR (Mean Time To Resolution)**, training overhead, and knowledge
dependency on a few key people.

### The Solution
A **Retrieval-Augmented Generation (RAG)** assistant that:
1. Ingests internal SOP documents (any format),
2. Converts them into a searchable semantic index,
3. Retrieves the most relevant passages for each question, and
4. Uses a Large Language Model (LLM) to synthesize a clean, cited answer.

### Business Value
- **Faster incident resolution** — answers in seconds, not minutes of searching.
- **Standardized operations** — every shift follows the same SOP.
- **Reduced training time** — new engineers become self-sufficient faster.
- **Knowledge retention** — expertise lives in the system, not just in people's heads.
- **24/7 availability** — the assistant never sleeps.

---

## 2. Key Features

| Feature | Description |
|---|---|
| **Natural-language Q&A** | Ask operational questions conversationally; get step-by-step answers. |
| **Streaming responses** | Answers stream in token-by-token (ChatGPT/Claude style), not a delayed paste. |
| **Source citations** | Each answer shows the source SOP documents as clean chips — no inline clutter. |
| **No hallucination** | The model answers *only* from the SOP knowledge base; if info is missing, it says so. |
| **Multi-format ingestion** | Upload PDF, Word, Excel, PowerPoint, or TXT — all parsed automatically. |
| **Category filtering** | Scope a question to a specific SOP area (Case Creation, Alerts, Aerial, etc.). |
| **Role-based access** | Manager / Lead Analyst / Solar Analyst roles with different permissions. |
| **Admin panel** | Drag-and-drop document upload, live ingestion status, knowledge-base management. |
| **Chat history** | Managers/Leads see team history; Analysts see their own. |
| **Copy & Stop** | Copy any answer; stop generation mid-stream. |

---

## 3. Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | UI framework (component-based SPA). |
| **Vite 5** | Dev server + build tool (fast HMR, dev proxy to backend). |
| **React Router 6** | Client-side routing (Login / Chat / Admin, with protected routes). |
| **Axios** | HTTP client for JSON API calls. |
| **fetch + ReadableStream** | Consumes the Server-Sent Events (SSE) token stream. |
| **react-markdown** | Renders the assistant's markdown answers (lists, tables, code). |
| **Inline styles + custom CSS** | Navy + solar-amber design system; animations (streaming cursor, typing dots). |

### Backend
| Technology | Purpose |
|---|---|
| **Python 3.13** | Backend language. |
| **FastAPI** | REST + streaming API framework. |
| **Uvicorn** | ASGI server. |
| **Pydantic / pydantic-settings** | Request/response validation & config. |
| **python-jose (JWT)** | Token-based authentication. |
| **passlib + bcrypt** | Password hashing. |
| **Server-Sent Events (SSE)** | Streams answer tokens to the browser. |

### AI / RAG Layer
| Technology | Purpose |
|---|---|
| **Groq API — Llama 3.3 70B** | Primary LLM for answer generation (free tier, very fast). Fallback: Llama 3.1 8B Instant. |
| **OpenAI GPT-4o-mini** | Optional alternative LLM (config-switchable). |
| **sentence-transformers (all-MiniLM-L6-v2)** | Local embedding model — 384-dim vectors, free, runs on CPU, no API key. |
| **ChromaDB** | Persistent vector database (cosine similarity search). |
| **LangChain (RecursiveCharacterTextSplitter)** | Splits documents into overlapping chunks. |

### Document Processing
| Technology | Format |
|---|---|
| **pdfplumber** | PDF (text + tables) |
| **python-docx** | Word (.docx / .doc) |
| **openpyxl / pandas** | Excel (.xlsx / .xls) |
| **python-pptx** | PowerPoint (.pptx / .ppt) |
| built-in | Plain text (.txt) |

### Tooling / Infra
- **python-dotenv** — environment configuration (`.env`).
- **Vite dev proxy** — forwards `/api` → backend (no CORS issues in dev).
- **CORS middleware** — configured for the React dev origin.

---

## 4. System Architecture

```
┌──────────────┐     HTTPS/JSON + SSE      ┌────────────────────────────┐
│   Browser    │ ───────────────────────▶  │        FastAPI (/api)      │
│  React SPA   │ ◀───── token stream ─────  │  auth · chat · docs routers│
└──────────────┘                           └─────────────┬──────────────┘
   Login · Chat · Admin                                   │
                                                          ▼
                                            ┌────────────────────────────┐
                                            │        RAG Pipeline         │
                                            │  1. embed query  (MiniLM)   │
                                            │  2. vector search (ChromaDB)│
                                            │  3. build context           │
                                            │  4. generate (Groq Llama)   │
                                            └─────────────┬──────────────┘
                                                          ▼
                                            ┌────────────────────────────┐
                                            │  ChromaDB (vector store)    │
                                            │  ← SOP chunks + embeddings  │
                                            └────────────────────────────┘
```

### Retrieval-Augmented Generation (RAG) flow
1. **Ingestion (offline):** Document → parse text → split into ~800-char chunks
   (100-char overlap) → embed each chunk with MiniLM → store vectors + metadata in ChromaDB.
2. **Query (live):**
   - User question is embedded into the same vector space.
   - ChromaDB returns the top-K most similar SOP chunks (cosine similarity).
   - Retrieved chunks form the "context."
   - The LLM is prompted to answer **only** from that context, and to write cleanly
     (no inline source markers).
   - The answer streams to the browser token-by-token; source documents are returned
     separately and shown as chips.

---

## 5. Project Structure

```
Astra-AI-SolarOps/
├── backend/
│   ├── main.py                     # FastAPI app entry + CORS + routers
│   ├── requirements.txt
│   ├── .env                        # API keys + config (Groq, paths)
│   ├── chroma_db/                  # persistent vector store
│   └── app/
│       ├── config.py               # app settings
│       ├── auth.py                 # JWT + password hashing + role guards
│       ├── database.py             # in-memory users + chat history
│       ├── schemas.py              # Pydantic request/response models
│       ├── routers/
│       │   ├── auth_router.py      # /api/auth/login, /me
│       │   ├── chat_router.py      # /api/chat/stream (SSE), /query, /history, /stats
│       │   └── docs_router.py      # /api/docs/upload, /list, /status, delete
│       ├── ingestion/
│       │   ├── parsers.py          # PDF/DOCX/XLSX/PPTX/TXT → text
│       │   └── pipeline.py         # parse → chunk → embed → store
│       └── rag/
│           ├── embedder.py         # MiniLM local embeddings
│           ├── vector_store.py     # ChromaDB add/search/list/delete
│           ├── llm.py              # Groq/OpenAI + streaming + fallback
│           └── chain.py            # retrieval + generation orchestration
├── frontend/
│   ├── index.html
│   ├── vite.config.js              # dev proxy /api → :8000
│   └── src/
│       ├── main.jsx, App.jsx       # bootstrap + routes
│       ├── index.css               # design system + markdown + animations
│       ├── api/client.js           # axios + streamChat() SSE reader
│       └── pages/
│           ├── Login.jsx           # auth screen
│           ├── Chat.jsx            # streaming chat UI
│           └── Admin.jsx           # document management
├── data/sop-documents/             # source SOP files
├── README.md                       # setup & run guide
└── PROJECT.md                      # this document
```

---

## 6. Knowledge Base (current)

10 real Clean Leaf / AGS SOPs ingested (~84 searchable chunks):

| Document | Category |
|---|---|
| AES_Case creation_SOP | Case Creation |
| Maintenance Case Creation | Case Creation |
| Reactive Case creation | Case Creation |
| Types in Case Creation | Case Creation |
| Case Scheduling Process | Scheduling |
| Solar_Plant_Alerts_SOP | Alerts |
| Aerial_Inspection | Aerial |
| Aerial Remediation | Aerial |
| Ops Review | Ops Review |
| Reports | Reports |

---

## 7. Authentication & Roles

JWT-based auth. Three roles with escalating permissions:

| Role | Chat | Upload docs | Delete docs | History visibility |
|---|---|---|---|---|
| **Solar Analyst** | ✅ | ❌ | ❌ | own only |
| **Lead Analyst** | ✅ | ✅ | ❌ | team-wide |
| **Manager** | ✅ | ✅ | ✅ | team-wide |

Demo accounts (password `astra2026`): `manager@ags.com`, `lead@ags.com`, `analyst@ags.com`.

---

## 8. API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Authenticate, returns JWT + user. |
| GET  | `/api/auth/me` | Current user from token. |
| POST | `/api/chat/stream` | **Streaming** answer (SSE: sources → tokens → done). |
| POST | `/api/chat/query` | Non-streaming answer (for scripts/tests). |
| GET  | `/api/chat/history` | Chat history (role-scoped). |
| GET  | `/api/chat/stats` | Knowledge-base stats. |
| POST | `/api/docs/upload` | Upload + ingest a document (async). |
| GET  | `/api/docs/status/{job}` | Ingestion job status. |
| GET  | `/api/docs/list` | List ingested documents. |
| DELETE | `/api/docs/{filename}` | Remove a document (Manager only). |
| GET  | `/health` | Health check. |

---

## 9. Design Highlights

- **Streaming UX** — token-by-token responses with a blinking cursor and typing indicator,
  matching ChatGPT/Claude.
- **Clean, client-ready answers** — the prompt forbids inline citations/chunk labels, so
  answers read naturally; sources appear as separate chips.
- **Grounded & safe** — the model answers only from retrieved SOP context and declines when
  information isn't present (prevents made-up procedures).
- **Solar-branded design system** — deep navy + amber/orange gradient, Inter typography,
  smooth animations, responsive centered chat column.

---

## 10. Future Enhancements

- **Reranker + larger retrieval** for sharper answers on deep, detailed questions.
- **Conversation memory** for multi-turn follow-ups.
- **Persistent database** (PostgreSQL) for users & chat history (currently in-memory).
- **SCADA / live-alarm integration** to auto-recommend actions on real alerts.
- **Teams / WhatsApp / voice** interfaces.
- **Multi-language support** (English + others).
- **Incident RCA generator** and **AI ticket creation**.

---

## 11. Setup & Run (quick reference)

```bash
# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt          # first time
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install                              # first time
npm run dev                              # http://localhost:5173
```

Add a free Groq API key to `backend/.env` (`GROQ_API_KEY=gsk_...`) to enable
AI-generated answers. See `README.md` for full details.
