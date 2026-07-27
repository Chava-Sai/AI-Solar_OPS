# Astra AI backend — Google Cloud Run
#
# Cloud Run runs this as a normal container: unlike Supabase Edge Functions
# (JavaScript-only) or serverless platforms with execution-time limits, this
# gives us a real, long-lived Python process — needed for the embedding
# model, ChromaDB, and streamed (SSE) chat responses.
#
# Build + deploy (from the backend/ directory):
#   gcloud run deploy astra-ai-backend --source . --region us-central1 \
#     --allow-unauthenticated --memory 1Gi --min-instances 1
#
# `--min-instances 1` keeps one instance warm so the embedding model doesn't
# reload (and users don't eat a cold-start) on every request — the same
# problem we hit on Render's free tier, solved properly here.

FROM python:3.13-slim

WORKDIR /app

# System packages in case any dependency lacks a prebuilt wheel for this
# exact Python/platform combo and needs to compile from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code + the pre-built knowledge base (chroma_db) ship in the image
# itself, exactly as they do for the Render deploy — no re-ingestion needed
# on a fresh container start.
COPY . .

# Cloud Run injects $PORT (defaults to 8080) — the container must listen on it.
ENV PORT=8080
EXPOSE 8080

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
