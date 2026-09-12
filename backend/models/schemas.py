"""Pydantic schemas for API request / response."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Input ─────────────────────────────────────────────────────────────────────


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="Natural-language query")
    top_k: int = Field(default=5, ge=1, le=20)


# ── Internal message model ─────────────────────────────────────────────────────


class Message(BaseModel):
    id: str
    timestamp: datetime
    sender: str
    text: str
    conversation_id: str
    message_type: str = "text"


# ── Output ────────────────────────────────────────────────────────────────────


class TimeRange(BaseModel):
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    label: Optional[str] = None  # human-readable, e.g. "August 2026"


class QueryInterpretation(BaseModel):
    person: Optional[str] = None
    time_range: Optional[TimeRange] = None
    semantic_query: str
    query_type: str = "semantic"  # semantic | person | time | mixed


class ContextMessage(BaseModel):
    id: str
    sender: str
    timestamp: datetime
    text: str
    is_match: bool = False


class SignalScores(BaseModel):
    semantic: float = 0.0
    lexical: float = 0.0
    person: float = 0.0
    temporal: float = 0.0
    decision: float = 0.0
    final: float = 0.0


class SearchResult(BaseModel):
    message_id: str
    score: float
    sender: str
    timestamp: datetime
    message: str
    conversation_id: str
    context: list[ContextMessage] = []
    signals: SignalScores


class SearchResponse(BaseModel):
    query: str
    interpretation: QueryInterpretation
    results: list[SearchResult]
    total_searched: int
    search_time_ms: float
