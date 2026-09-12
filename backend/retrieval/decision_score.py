"""Decision-signal scorer.

Detects whether a message contains decision-like language in
English or Hinglish/Hindi (Roman script).
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Keyword lists
# ---------------------------------------------------------------------------

_DECISION_PHRASES: list[str] = [
    # English
    "final",
    "done",
    "fixed",
    "decided",
    "locked",
    "confirmed",
    "confirm",
    "settled",
    "agreed",
    "let's do",
    "lets do",
    "go with",
    "proceed",
    "booked",
    "book kar",
    "approved",
    # Hinglish
    "pakka",
    "pakka hai",
    "fix hai",
    "final hai",
    "final karte",
    "kar lete",
    "kar liya",
    "ho gaya",
    "haan bhai",
    "chal",
    "chalo",
    "toh",
    "theek hai",
    "bas",
    "set hai",
    "done hai",
    "confirmed hai",
    "reservation",
    "book",
]

_DECISION_PATTERN = re.compile(
    r"(?<!\w)(" + "|".join(re.escape(p) for p in sorted(_DECISION_PHRASES, key=len, reverse=True)) + r")(?!\w)",
    re.IGNORECASE,
)


def decision_score(text: str) -> float:
    """Return a score in [0, 1] indicating how decision-like the message is.

    Higher = more signals of a concrete decision / commitment.
    """
    if not text or not text.strip():
        return 0.0

    matches = _DECISION_PATTERN.findall(text)
    if not matches:
        return 0.0

    # Score increases with number of distinct signals, capped at 1.0
    unique = set(m.lower() for m in matches)
    raw = len(unique)
    score = min(1.0, 0.4 + (raw - 1) * 0.2)
    return round(score, 4)
