"""Query parser: extract person, time, and semantic query from raw text."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from .temporal import parse_time_expression

# ── Known participants (lower-case) ──────────────────────────────────────────
_PARTICIPANTS: list[str] = [
    "rahul", "priya", "ankit", "neha", "vikas", "sneha", "karan", "meera",
]

# ── Phrases that introduce a person reference ────────────────────────────────
_PERSON_TRIGGERS = re.compile(
    r"(?:what\s+did|what\s+was|what\s+has|what's|what\s+were|"
    r"did|said|say|mentioned|suggested|asked|told|what\s+about|"
    r"opinion\s+of|view\s+of|advice\s+from|message\s+from)\s+"
    r"([A-Z][a-z]+|[a-z]+)",
    re.IGNORECASE,
)

# ── Time-trigger keywords (used to decide query_type) ────────────────────────
_TIME_TRIGGERS = re.compile(
    r"\b("
    r"today|yesterday|"
    r"this week|last week|"
    r"this month|last month|"
    r"in [a-z]+|around [a-z]+|"
    r"between \w+ \d+ and|"
    r"earlier this year|"
    r"summer|winter|monsoon|spring|fall|autumn"
    r")\b",
    re.IGNORECASE,
)

# ── Filler phrases to strip before embedding ─────────────────────────────────
_STRIP_PATTERNS = [
    r"what did [a-z]+ say (about|regarding|on|concerning)\s+",
    r"what was [a-z]+'s (view|opinion|suggestion|take|message) (on|about|regarding)\s+",
    r"what did [a-z]+ (mention|suggest|ask|tell|write|post)\s*",
    r"what did (we|the group|everyone|they) (discuss|decide|talk about|plan)\s*",
    r"(did|what) (priya|rahul|ankit|neha|vikas|sneha|karan|meera)\s+(say|mention|suggest|write)\s*",
    r"\b(what|when|where|why|who|how)\b\s+",
    r"\b(did|was|were|is|are|has|have)\b\s+",
    r"\b(the|a|an|we|they|our|their)\b\s+",
]
_STRIP_RE = [re.compile(p, re.IGNORECASE) for p in _STRIP_PATTERNS]


def _extract_person(text: str) -> Optional[str]:
    """Return the participant name mentioned in the query, or None."""
    tl = text.lower()
    for name in _PARTICIPANTS:
        if re.search(rf"\b{name}\b", tl):
            return name.capitalize()
    return None


def _strip_constraints(text: str, person: Optional[str]) -> str:
    """Remove person/time preamble to isolate the semantic core."""
    result = text
    # Remove person name
    if person:
        result = re.sub(rf"\b{person}\b", "", result, flags=re.IGNORECASE)
    # Remove common question filler
    for pattern in _STRIP_RE:
        result = pattern.sub(" ", result)
    # Collapse whitespace
    result = " ".join(result.split())
    return result.strip() or text  # fall back to original if empty


def parse_query(text: str, reference_date: datetime) -> dict:
    """Parse a raw user query.

    Returns a dict with keys:
        person          – str or None
        time_range      – dict {start, end, label} or None
        semantic_query  – cleaned string to embed
        query_type      – 'semantic' | 'person' | 'time' | 'mixed'
    """
    person = _extract_person(text)
    time_result = parse_time_expression(text, reference_date)

    if time_result:
        start, end, label = time_result
        time_range = {"start": start, "end": end, "label": label}
    else:
        time_range = None

    # Determine query type
    has_person = person is not None
    has_time = time_range is not None
    if has_person and has_time:
        query_type = "mixed"
    elif has_person:
        query_type = "person"
    elif has_time:
        query_type = "time"
    else:
        query_type = "semantic"

    semantic_query = _strip_constraints(text, person)

    return {
        "person": person,
        "time_range": time_range,
        "semantic_query": semantic_query,
        "query_type": query_type,
    }
