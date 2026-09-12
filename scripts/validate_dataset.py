"""Validate the synthetic dataset meets all structural requirements.

Run:
    python scripts/validate_dataset.py

Checks:
  ✓ 4,000+ messages
  ✓ 8+ participants
  ✓ 6+ months of coverage
  ✓ exactly 40 queries
  ✓ at least 8 hard queries
  ✓ every query's answer_message_id exists in messages
  ✓ hard queries have zero lexical overlap with answer text
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

MESSAGES_PATH = Path("data/messages.json")
QUERIES_PATH = Path("data/test_queries.json")

PASS = "[PASS]"
FAIL = "[FAIL]"

errors: list[str] = []


def check(condition: bool, label: str, detail: str = "") -> bool:
    symbol = PASS if condition else FAIL
    print(f"  {symbol} {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        errors.append(label)
    return condition


def tokenize(text: str) -> set[str]:
    """Simple word tokenizer — lower, alpha only, min length 2."""
    return {
        w.lower()
        for w in re.findall(r"[a-zA-Z]{2,}", text)
    }


def main() -> None:
    print("\n=== Dataset Validation ===\n")

    # ── Load ──────────────────────────────────────────────────────────────
    if not MESSAGES_PATH.exists():
        print(f"{FAIL} {MESSAGES_PATH} not found — run generate_dataset.py first")
        sys.exit(1)
    if not QUERIES_PATH.exists():
        print(f"{FAIL} {QUERIES_PATH} not found")
        sys.exit(1)

    with open(MESSAGES_PATH, encoding="utf-8") as f:
        messages: list[dict] = json.load(f)
    with open(QUERIES_PATH, encoding="utf-8") as f:
        queries: list[dict] = json.load(f)

    msg_by_id = {m["id"]: m for m in messages}

    # ── Message checks ────────────────────────────────────────────────────
    print("Messages:")
    check(len(messages) >= 4000, "Messages ≥ 4,000", str(len(messages)))

    senders = {m["sender"] for m in messages}
    check(len(senders) >= 8, "Participants ≥ 8", f"{len(senders)}: {', '.join(sorted(senders))}")

    timestamps = sorted(m["timestamp"] for m in messages)
    t_start = datetime.fromisoformat(timestamps[0])
    t_end   = datetime.fromisoformat(timestamps[-1])
    # Count distinct calendar months covered (inclusive)
    months_covered = set()
    for m in messages:
        ts = datetime.fromisoformat(m["timestamp"])
        months_covered.add((ts.year, ts.month))
    months = len(months_covered)
    check(
        months >= 6,
        "Date range ≥ 6 months",
        f"{t_start.strftime('%Y-%m-%d')} → {t_end.strftime('%Y-%m-%d')} ({months} months)",
    )

    conversations = {m["conversation_id"] for m in messages}
    long_convs = {
        conv_id
        for conv_id in conversations
        if sum(1 for m in messages if m["conversation_id"] == conv_id) >= 30
    }
    check(len(long_convs) >= 3, "Long decision threads ≥ 3 (30+ msgs each)", f"{len(long_convs)}: {long_convs}")

    has_media = any(m["message_type"] in ("media", "system", "reaction") for m in messages)
    check(has_media, "Media/system/reaction messages present")

    # ── Query checks ──────────────────────────────────────────────────────
    print("\nQueries:")
    check(len(queries) == 40, "Exactly 40 queries", str(len(queries)))

    hard_queries = [q for q in queries if q.get("hard", False)]
    check(len(hard_queries) >= 8, "Hard queries ≥ 8", str(len(hard_queries)))

    # All answer IDs exist
    missing = [q["query_id"] for q in queries if q["answer_message_id"] not in msg_by_id]
    check(len(missing) == 0, "All answer_message_ids exist in corpus",
          "MISSING: " + str(missing) if missing else "all present")

    # ── Zero-overlap verification ─────────────────────────────────────────
    print("\nZero-overlap (hard queries):")
    zero_overlap_ok = 0
    for q in hard_queries:
        mid = q["answer_message_id"]
        if mid not in msg_by_id:
            continue
        answer_text = msg_by_id[mid]["text"]
        query_tokens = tokenize(q["query"])
        answer_tokens = tokenize(answer_text)
        overlap = query_tokens & answer_tokens
        has_zero_overlap = len(overlap) == 0
        status = PASS if has_zero_overlap else FAIL
        overlap_str = f"OVERLAP: {overlap}" if overlap else "clean"
        print(f"    {status} [{q['query_id']}] \"{q['query'][:55]}\"")
        if not has_zero_overlap:
            print(f"         Answer: \"{answer_text[:60]}\"")
            print(f"         {overlap_str}")
        else:
            zero_overlap_ok += 1

    check(
        zero_overlap_ok == len(hard_queries),
        f"Zero-overlap hard queries verified",
        f"{zero_overlap_ok}/{len(hard_queries)}",
    )

    # ── Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 40)
    if errors:
        print(f"\033[91mFAILED — {len(errors)} check(s):\033[0m")
        for e in errors:
            print(f"  • {e}")
        sys.exit(1)
    else:
        print("\033[92mAll checks passed ✓\033[0m")
        print(f"\n  Messages : {len(messages):,}")
        print(f"  Senders  : {len(senders)}")
        print(f"  Date range: {t_start.strftime('%Y-%m-%d')} → {t_end.strftime('%Y-%m-%d')}")
        print(f"  Queries  : {len(queries)}")
        print(f"  Hard     : {len(hard_queries)}")
        print(f"  Zero-overlap verified: {zero_overlap_ok}/{len(hard_queries)}")


if __name__ == "__main__":
    main()
