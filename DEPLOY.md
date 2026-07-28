# Deploying Astra AI for the team pilot

**Frontend → Vercel** (best fit: static React/Vite build, free, instant global CDN).
**Backend → Google Cloud Run** (current direction — real Docker container, no
serverless language restriction, fits the embedding model + streaming responses
comfortably). **Render** is kept documented below since it's what testing has
used so far; the app deploys identically to either.

---

## 0. Backend → Google Cloud Run (current direction)

Cloud Run runs `backend/Dockerfile` as a normal container — unlike Supabase's
Edge Functions (JavaScript-only) or Vercel's serverless functions (execution-time
limits, cold-start-unfriendly for a model that needs to stay loaded), this is a
real, long-lived Python process with configurable memory, which is exactly what
the embedding model + ChromaDB + streamed (SSE) chat responses need.

```bash
# from the backend/ directory, with gcloud CLI authenticated and a project selected
gcloud run deploy astra-ai-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --min-instances 1 \
  --set-env-vars ALLOWED_ORIGINS=https://your-vercel-url.vercel.app
```

- `--min-instances 1` keeps one instance warm — no cold-start reload of the
  embedding model on the first request after idle time (the problem we hit on
  Render's free tier).
- Set `GROQ_API_KEY` as a secret rather than a plain env var:
  `gcloud run services update astra-ai-backend --set-secrets=GROQ_API_KEY=groq-api-key:latest`
  (create the secret first: `gcloud secrets create groq-api-key --data-file=-`).
- The knowledge base (`backend/chroma_db`, 27 documents / 2,547 chunks / 34 FAQ
  entries) is baked into the image at build time — no re-ingestion step needed.
- **Persistence caveat still applies here too**, same as Render: anything written
  after the container starts (new Admin-panel uploads, chat history, usage
  counters) resets when Cloud Run recycles the instance, until the Supabase
  migration lands (see the README's "Database design" section).
- Point Vercel's `VITE_API_URL` at the Cloud Run URL it gives you
  (`https://astra-ai-backend-xxxxx.<region>.run.app`), and update
  `ALLOWED_ORIGINS` above once you have the real Vercel URL.

---

## Backend → Render (used for testing so far)

### ⚠️ Known limits of the Render free tier

1. **Free-tier storage resets.** Render's free plan has no persistent disk. The
   **knowledge base is unaffected** — it's pre-built and shipped with the code
   (`backend/chroma_db`, 27 documents / 2,547 chunks / 34 FAQ entries already
   indexed). But anything written *after* boot — new Admin-panel uploads, chat
   history, daily usage counters — resets whenever the free instance spins down
   from inactivity (~15 min idle) and back up. Fine for a pilot; mention it to
   the team so nobody's surprised.
2. **Free-tier cold start.** After 15 minutes idle, the first request takes
   ~30-60s while Render wakes the instance and reloads the embedding model.

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

## Accounts for the team

One seeded account: **`Arunpandian@amgsol.com`** / `Arun@123` (Manager). Sign in
with it, then go to **Admin → Team access** to add everyone else — email,
temporary password, role. No code changes or redeploys needed to add/remove
people; each person changes their own password after first login (key icon next
to Sign out).

---

## Redeploying after code changes

- **Vercel**: redeploys automatically on every push to the connected branch.
- **Render**: same — auto-deploys on push. Manual redeploy button is in the
  dashboard if you need to force one (e.g. after changing an env var).
