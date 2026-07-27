"""
Case-type disambiguation guard.

SME feedback (2026-07-27): SOPs define several similarly-named but DISTINCT
case types — "Reactive" vs "Ancillary – Reactive" vs "Maintenance / PM" — and
pure vector similarity sometimes ranks a chunk about the WRONG type
competitively close to chunks about the right one. Measured example: for the
query "reactive case creation procedure", a chunk about "Ancillary – Reactive"
scored distance 0.471 against a best score of 0.328 — close enough to enter
the context window and get blended into the answer, exactly matching what
was reported (asking about a standard reactive case returned Ancillary –
Reactive fields).

This does not hard-classify every chunk — only chunks that are CLEARLY and
SOLELY about one type get tagged; anything mentioning 0 or 2+ types (e.g. an
overview paragraph listing all case types) is left untouched. When the query
clearly names one type and a chunk is clearly about a different one, that
chunk's effective distance gets a penalty so same-type chunks are preferred
— it's never hard-excluded, so it can still surface if nothing better exists.
"""
import re

# Matched first and stripped out before the plain "reactive" pattern runs, so
# "Ancillary – Reactive" text is never also counted as plain "Reactive".
_ANCILLARY_REACTIVE_RE = re.compile(r"ancillary\s*[-–—]?\s*reactive", re.IGNORECASE)

_TYPE_PATTERNS = [
    ("module_washing", re.compile(r"module\s+washing", re.IGNORECASE)),
    ("landscaping", re.compile(r"landscaping", re.IGNORECASE)),
    ("maintenance_pm", re.compile(
        r"\bprimary\s+pm\b|\bsecondary\s+pm\b|\bpreventive\s+maintenance\b"
        r"|\bmaintenance\s+case\b|\bpm\s+case\s+creation\b", re.IGNORECASE)),
    ("reactive", re.compile(r"\breactive\b", re.IGNORECASE)),
]

MISMATCH_PENALTY = 0.25  # added to a chunk's distance when types disagree


def _detect_types(text: str) -> set[str]:
    found = set()
    if _ANCILLARY_REACTIVE_RE.search(text):
        found.add("ancillary_reactive")
    stripped = _ANCILLARY_REACTIVE_RE.sub(" ", text)
    for label, pattern in _TYPE_PATTERNS:
        if pattern.search(stripped):
            found.add(label)
    return found


def query_case_type(query: str) -> str | None:
    """The single case type the query clearly names, or None (0 or 2+ found)."""
    types = _detect_types(query)
    return next(iter(types)) if len(types) == 1 else None


def chunk_case_type(text: str) -> str | None:
    """The single case type a chunk is solely about, or None (0 or 2+ found —
    e.g. an overview chunk that lists multiple types shouldn't be penalized)."""
    types = _detect_types(text)
    return next(iter(types)) if len(types) == 1 else None


def rerank_by_case_type(query: str, chunks: list[str], metadatas: list[dict],
                        distances: list[float]) -> tuple[list, list, list]:
    """
    Apply the mismatch penalty and re-sort. No-ops (returns input unchanged
    order) when the query doesn't clearly name a single case type.
    """
    q_type = query_case_type(query)
    if q_type is None:
        return chunks, metadatas, distances

    adjusted = []
    for chunk, meta, dist in zip(chunks, metadatas, distances):
        c_type = chunk_case_type(chunk)
        penalty = MISMATCH_PENALTY if (c_type is not None and c_type != q_type) else 0.0
        adjusted.append((dist + penalty, chunk, meta, dist))

    adjusted.sort(key=lambda x: x[0])
    new_chunks   = [a[1] for a in adjusted]
    new_metas    = [a[2] for a in adjusted]
    new_dists    = [a[0] for a in adjusted]  # use adjusted distance downstream
    return new_chunks, new_metas, new_dists
