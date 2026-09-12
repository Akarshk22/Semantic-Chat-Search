"""FastAPI application entry point."""

from __future__ import annotations

import time
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models.schemas import (
    ContextMessage,
    QueryInterpretation,
    SearchRequest,
    SearchResponse,
    SearchResult,
    SignalScores,
    TimeRange,
)
from .retrieval.context_expander import ContextExpander
from .retrieval.query_parser import parse_query
from .retrieval.reranker import Reranker
from .services.index_service import IndexService

app = FastAPI(
    title="Semantic Chat Archive Search",
    description="Find what you remember, even when you don't remember the words.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_reranker = Reranker()
_context_expander: ContextExpander | None = None


@app.on_event("startup")
async def startup() -> None:
    global _context_expander
    svc = IndexService.get()
    svc.load()
    _context_expander = ContextExpander(settings.db_path)


@app.get("/health")
def health() -> dict:
    svc = IndexService.get()
    return {
        "status": "ok",
        "messages_loaded": len(svc.messages_by_id),
        "model": settings.embedding_model,
    }


@app.post("/api/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    t0 = time.perf_counter()
    svc = IndexService.get()

    if not svc._loaded:
        raise HTTPException(status_code=503, detail="Index not ready")

    # ── 1. Parse query ─────────────────────────────────────────────────────
    ref_date = (
        datetime.fromisoformat(settings.reference_date)
        if settings.reference_date
        else datetime.now()
    )
    parsed = parse_query(req.query, ref_date)

    person = parsed["person"]
    time_range = parsed["time_range"]
    query_type = parsed["query_type"]
    semantic_query = parsed["semantic_query"]

    # ── 2. Embed query ─────────────────────────────────────────────────────
    q_vec = svc.embed_query(semantic_query)

    # ── 3. Candidate generation ────────────────────────────────────────────
    candidate_k = max(req.top_k * 8, 60)  # retrieve a generous pool

    semantic_hits = svc.semantic.search(q_vec, top_k=candidate_k)
    lexical_hits = svc.lexical.search(semantic_query, top_k=candidate_k)

    # Build combined candidate dict
    candidates: dict[str, dict] = {}

    for msg_id, score in semantic_hits:
        msg = svc.get_message(msg_id)
        if msg is None:
            continue
        candidates[msg_id] = {
            "text": msg["text"],
            "sender": msg["sender"],
            "timestamp": msg["timestamp"],
            "conversation_id": msg["conversation_id"],
            "semantic": score,
            "lexical": 0.0,
        }

    for msg_id, score in lexical_hits:
        if msg_id in candidates:
            candidates[msg_id]["lexical"] = score
        else:
            msg = svc.get_message(msg_id)
            if msg is None:
                continue
            candidates[msg_id] = {
                "text": msg["text"],
                "sender": msg["sender"],
                "timestamp": msg["timestamp"],
                "conversation_id": msg["conversation_id"],
                "semantic": 0.0,
                "lexical": score,
            }

    # ── 4. Person / time pre-filtering (hard filter only when very specific) ──
    # For person queries, heavily boost but DON'T hard-exclude other senders
    # (the reranker handles weight adjustment)

    # If time query with no semantic overlap, widen candidates to all messages
    # within the time range
    if time_range and query_type == "time":
        start_ts = time_range["start"].isoformat()
        end_ts = time_range["end"].isoformat()
        for msg in svc.ordered_messages:
            if msg["id"] not in candidates:
                if start_ts <= msg["timestamp"] <= end_ts:
                    candidates[msg["id"]] = {
                        "text": msg["text"],
                        "sender": msg["sender"],
                        "timestamp": msg["timestamp"],
                        "conversation_id": msg["conversation_id"],
                        "semantic": 0.0,
                        "lexical": 0.0,
                    }

    # ── 4b. Person widening — include ALL messages by that sender ─────────────
    if person and query_type in ("person", "mixed"):
        for msg in svc.ordered_messages:
            if msg["id"] not in candidates and msg["sender"].lower() == person.lower():
                candidates[msg["id"]] = {
                    "text": msg["text"],
                    "sender": msg["sender"],
                    "timestamp": msg["timestamp"],
                    "conversation_id": msg["conversation_id"],
                    "semantic": 0.0,
                    "lexical": 0.0,
                }

    # ── 5. Re-rank ─────────────────────────────────────────────────────────
    ranked = _reranker.rank(
        candidates,
        query_type=query_type,
        person=person,
        time_range=time_range,
    )

    top_results = ranked[: req.top_k]

    # ── 6. Context expansion + build response ──────────────────────────────
    results: list[SearchResult] = []
    for item in top_results:
        msg_id = item["message_id"]
        context_msgs, match_idx = _context_expander.get_context(
            msg_id, window=settings.context_window
        )

        context_out = [
            ContextMessage(
                id=cm["id"],
                sender=cm["sender"],
                timestamp=cm["timestamp"],
                text=cm["text"],
                is_match=(i == match_idx),
            )
            for i, cm in enumerate(context_msgs)
        ]

        ts = item.get("timestamp")
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)

        sig = item["signals"]
        results.append(
            SearchResult(
                message_id=msg_id,
                score=item["score"],
                sender=item["sender"],
                timestamp=ts,
                message=item["text"],
                conversation_id=item.get("conversation_id", ""),
                context=context_out,
                signals=SignalScores(**sig),
            )
        )

    # ── 7. Build interpretation ────────────────────────────────────────────
    tr_out = None
    if time_range:
        tr_out = TimeRange(
            start=time_range["start"],
            end=time_range["end"],
            label=time_range.get("label"),
        )

    interpretation = QueryInterpretation(
        person=person,
        time_range=tr_out,
        semantic_query=semantic_query,
        query_type=query_type,
    )

    elapsed_ms = (time.perf_counter() - t0) * 1000

    return SearchResponse(
        query=req.query,
        interpretation=interpretation,
        results=results,
        total_searched=len(candidates),
        search_time_ms=round(elapsed_ms, 1),
    )


@app.get("/api/thread/{conversation_id}")
def get_thread(conversation_id: str, limit: int = 50) -> dict:
    """Return messages from a full thread."""
    msgs = _context_expander.get_thread_messages(conversation_id, limit=limit)
    return {"conversation_id": conversation_id, "messages": msgs}
