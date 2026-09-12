"""Temporal expression parser.

Converts natural-language time expressions into (start, end) datetime ranges,
relative to a configurable reference date.

Supported expressions (examples):
  - today / yesterday
  - this week / last week
  - this month / last month
  - in June / in July 2026
  - around July / around the second week of June
  - between June 10 and June 20
  - in summer
  - earlier this year
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta

# Month name → number
_MONTH_MAP: dict[str, int] = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

_WEEK_ORDINALS: dict[str, int] = {
    "first": 1, "1st": 1,
    "second": 2, "2nd": 2,
    "third": 3, "3rd": 3,
    "fourth": 4, "4th": 4,
    "last": 4,
}

_SEASON_MONTHS: dict[str, tuple[int, int]] = {
    "summer": (4, 8),
    "monsoon": (6, 9),
    "winter": (11, 2),
    "spring": (3, 5),
    "fall": (9, 11),
    "autumn": (9, 11),
}


def _month_range(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, 0, 0, 0)
    end = (start + relativedelta(months=1)) - timedelta(seconds=1)
    return start, end


def parse_time_expression(
    text: str,
    reference: datetime,
) -> Optional[tuple[datetime, datetime, str]]:
    """Try to extract a date range from *text*.

    Returns (start, end, human_label) or None if no temporal expression found.
    The returned datetimes are timezone-naive.
    """
    t = text.lower().strip()

    # ── absolute: "between June 10 and June 20" ───────────────────────────
    m = re.search(
        r"between\s+([a-z]+)\s+(\d{1,2})\s+and\s+([a-z]*)\s*(\d{1,2})",
        t,
    )
    if m:
        m1 = _MONTH_MAP.get(m.group(1))
        d1 = int(m.group(2))
        m2 = _MONTH_MAP.get(m.group(3)) if m.group(3) else m1
        d2 = int(m.group(4))
        if m1 and m2:
            y = reference.year
            start = datetime(y, m1, d1, 0, 0, 0)
            end = datetime(y, m2 if m2 else m1, d2, 23, 59, 59)
            label = f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}"
            return start, end, label

    # ── "last month" ─────────────────────────────────────────────────────
    if re.search(r"\blast\s+month\b", t):
        first_of_this = datetime(reference.year, reference.month, 1)
        last_month_start = first_of_this - relativedelta(months=1)
        start, end = _month_range(last_month_start.year, last_month_start.month)
        label = start.strftime("%B %Y")
        return start, end, label

    # ── "this month" ─────────────────────────────────────────────────────
    if re.search(r"\bthis\s+month\b", t):
        start, end = _month_range(reference.year, reference.month)
        label = start.strftime("%B %Y")
        return start, end, label

    # ── "last week" ──────────────────────────────────────────────────────
    if re.search(r"\blast\s+week\b", t):
        monday_this = reference - timedelta(days=reference.weekday())
        monday_last = monday_this - timedelta(weeks=1)
        start = monday_last.replace(hour=0, minute=0, second=0, microsecond=0)
        end = (monday_last + timedelta(days=6)).replace(hour=23, minute=59, second=59)
        label = f"Week of {start.strftime('%d %b %Y')}"
        return start, end, label

    # ── "this week" ──────────────────────────────────────────────────────
    if re.search(r"\bthis\s+week\b", t):
        monday = reference - timedelta(days=reference.weekday())
        start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        end = (monday + timedelta(days=6)).replace(hour=23, minute=59, second=59)
        label = f"Week of {start.strftime('%d %b %Y')}"
        return start, end, label

    # ── "yesterday" ──────────────────────────────────────────────────────
    if re.search(r"\byesterday\b", t):
        yesterday = reference - timedelta(days=1)
        start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        end = yesterday.replace(hour=23, minute=59, second=59)
        label = yesterday.strftime("%d %b %Y")
        return start, end, label

    # ── "today" ───────────────────────────────────────────────────────────
    if re.search(r"\btoday\b", t):
        start = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        end = reference.replace(hour=23, minute=59, second=59)
        label = reference.strftime("%d %b %Y")
        return start, end, label

    # ── "around the second week of June" ─────────────────────────────────
    m = re.search(
        r"(?:around\s+)?the\s+(first|second|third|fourth|last|\d(?:st|nd|rd|th)?)\s+week\s+of\s+([a-z]+)",
        t,
    )
    if m:
        week_n = _WEEK_ORDINALS.get(m.group(1).lower(), 1)
        month_n = _MONTH_MAP.get(m.group(2).lower())
        if month_n:
            y = reference.year
            # week_n=1 → days 1-7, week_n=2 → days 8-14, etc.
            day_start = (week_n - 1) * 7 + 1
            day_end = min(week_n * 7, 28)  # safe upper bound
            start = datetime(y, month_n, day_start, 0, 0, 0)
            end = datetime(y, month_n, day_end, 23, 59, 59)
            label = f"Week {week_n} of {start.strftime('%B %Y')}"
            return start, end, label

    # ── "in June" / "in July 2026" / "around July" ───────────────────────
    m = re.search(
        r"(?:\bin\b|\baround\b)\s+([a-z]+)(?:\s+(\d{4}))?",
        t,
    )
    if m:
        month_n = _MONTH_MAP.get(m.group(1).lower())
        if month_n:
            y = int(m.group(2)) if m.group(2) else reference.year
            start, end = _month_range(y, month_n)
            label = start.strftime("%B %Y")
            return start, end, label

    # ── season: "in summer" ──────────────────────────────────────────────
    for season, (sm, em) in _SEASON_MONTHS.items():
        if re.search(rf"\b{season}\b", t):
            y = reference.year
            start = datetime(y, sm, 1, 0, 0, 0)
            if em < sm:  # wraps year (winter)
                end = datetime(y + 1, em, 28, 23, 59, 59)
            else:
                _, end = _month_range(y, em)
            label = season.capitalize()
            return start, end, label

    # ── "earlier this year" ──────────────────────────────────────────────
    if re.search(r"earlier\s+this\s+year", t):
        start = datetime(reference.year, 1, 1, 0, 0, 0)
        end = (datetime(reference.year, reference.month, 1) - timedelta(days=1)).replace(
            hour=23, minute=59, second=59
        )
        label = f"Jan – {(reference - relativedelta(months=1)).strftime('%b %Y')}"
        return start, end, label

    return None


def temporal_score(msg_ts: datetime, start: datetime, end: datetime) -> float:
    """Score how well a message's timestamp falls within [start, end].

    Returns 1.0 if within range, decaying outside the range.
    """
    if start <= msg_ts <= end:
        return 1.0
    # Linear decay outside the window (up to 30 days away → 0)
    if msg_ts < start:
        delta = (start - msg_ts).total_seconds()
    else:
        delta = (msg_ts - end).total_seconds()
    decay_days = 30 * 86400  # 30 days in seconds
    return max(0.0, 1.0 - delta / decay_days)
