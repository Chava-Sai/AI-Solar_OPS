# Deploying Astra AI for the team pilot

**Frontend → Vercel** (best fit: static React/Vite build, free, instant global CDN).
**Backend → Render** (best fit: FastAPI needs a long-running process for streaming
SSE responses and the persistent embedding model — Vercel's serverless functions
are the wrong shape for that; Render runs it as a normal always-on web service).

---

## ⚠️ Known limits of this test deployment (read first)

1. **Free-tier RAM risk.** The embedding model (sentence-transformers + torch) is
   memory-hungry. Render's **free** plan gives 512MB RAM, which may not be enough —
   if the deploy crashes or restarts in a loop, upgrade to the **Starter** plan
   (~$7/month) for 512MB→2GB and it will resolve immediately.
2. **Free-tier storage resets.** Render's free plan has no persistent disk. The
   **knowledge base is unaffected** — it's pre-built and shipped with the code
   (`backend/chroma_db`, 27 documents / 2,547 chunks / 34 FAQ entries already
   indexed). But anything written *after* boot — new Admin-panel uploads, chat
   history, daily usage counters — resets whenever the free instance spins down
   from inactivity (~15 min idle) and back up. Fine for a pilot; mention it to
   the team so nobody's surprised.
3. **Free-tier cold start.** After 15 minutes idle, the first request takes
   ~30-60s while Render wakes the instance and reloads the embedding model.

---

## 1. Backend → Render

1. Push this repo to GitHub (see note below on whose account).
2. Go to [render.com](https://render.com) → **New → Blueprint** → connect the repo.
   Render will read `render.yaml` at the repo root and configure the service.
3. Before the first deploy completes, set these in the Render dashboard
   (Environment tab) — they're marked `sync: false` in render.yaml so they must
   be entered manually, never committed:
   - `GROQ_API_KEY` = your Groq key
   - `ALLOWED_ORIGINS` = your Vercel URL once you have it, e.g.
     `https://astra-ai-solarops.vercel.app` (comma-separate multiple origins)
4. Deploy. Health check: `https://<your-service>.onrender.com/health`

## 2. Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the
   same repo → set **Root Directory** to `frontend`.
2. Add an environment variable:
   - `VITE_API_URL` = `https://<your-render-service>.onrender.com` (no trailing slash)
3. Deploy. Vercel auto-detects Vite (`npm run build`, output `dist/`).
4. Copy the resulting `https://xxxx.vercel.app` URL back into Render's
   `ALLOWED_ORIGINS` (step 3 above) and redeploy the backend so CORS allows it.

## 3. Verify

Open the Vercel URL → log in with any account below → send a test question →
confirm it streams an answer with sources.

---

## Test accounts for the team

Password for **every** account: **`astra2026`**

| Email | Name | Role | Can do |
|---|---|---|---|
| `arun@ags.com` | Arun Pandian | **Manager** | Chat, upload/delete docs, full history, usage dashboard |
| `priya.lead@ags.com` | Priya Ramesh | Lead Analyst | Chat, upload docs, full history |
| `karthik.lead@ags.com` | Karthik Subramanian | Lead Analyst | Chat, upload docs, full history |
| `divya@ags.com` | Divya Krishnan | Solar Analyst | Chat, own history |
| `rahul@ags.com` | Rahul Mehta | Solar Analyst | Chat, own history |
| `sneha@ags.com` | Sneha Iyer | Solar Analyst | Chat, own history |
| `vikram@ags.com` | Vikram Nair | Solar Analyst | Chat, own history |
| `ananya@ags.com` | Ananya Reddy | Solar Analyst | Chat, own history |
| `suresh@ags.com` | Suresh Kumar | Solar Analyst | Chat, own history |
| `meera@ags.com` | Meera Pillai | Solar Analyst | Chat, own history |

Accounts and passwords are defined in `backend/app/database.py` — edit that file
to add/remove people or change the roster before the next deploy.

---

## Redeploying after code changes

- **Vercel**: redeploys automatically on every push to the connected branch.
- **Render**: same — auto-deploys on push. Manual redeploy button is in the
  dashboard if you need to force one (e.g. after changing an env var).
