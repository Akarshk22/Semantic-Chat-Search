"""Candidate fusion and re-ranking.

Combines signals from:
  - semantic similarity
  - lexical (BM25) score
  - person match
  - temporal proximity
  - decision heuristic

Weights are read from config but dynamically adjusted per query type.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from ..config import settings
from .decision_score import decision_score
from .temporal import temporal_score as _temporal_score


class Reranker:
    """Merge scores from multiple retrievers and produce a final ranking."""

    def __init__(self) -> None:
        self.base_weights = {
            "semantic": settings.weight_semantic,
            "lexical": settings.weight_lexical,
            "person": settings.weight_person,
            "temporal": settings.weight_temporal,
            "decision": settings.weight_decision,
        }

    def _get_weights(self, query_type: str) -> dict[str, float]:
        """Adjust weights based on detected query type."""
        w = dict(self.base_weights)
        if query_type == "person":
            # Boost person signal at the expense of temporal
            boost = 0.15
            w["person"] += boost
            w["semantic"] -= boost * 0.5
            w["temporal"] -= boost * 0.5
        elif query_type == "time":
            # Boost temporal signal
            boost = 0.15
            w["temporal"] += boost
            w["semantic"] -= boost * 0.5
            w["person"] -= boost * 0.5
        elif query_type == "mixed":
            w["person"] += 0.08
            w["temporal"] += 0.08
            w["semantic"] -= 0.10
            w["lexical"] -= 0.03
            w["decision"] -= 0.03
        # Normalise to sum = 1
        total = sum(w.values())
        return {k: max(0.0, v / total) for k, v in w.items()}

    def _dedup_by_conversation(
        self, ranked: list[dict], max_per_conv: int = 2
    ) -> list[dict]:
        """Within each conversation, surface the highest-decision message.

        This prevents a single thread from flooding results with near-duplicate
        context embeddings (e.g. 5 trip messages all containing the decision text).
        Within each conversation group, we re-sort by (decision_score DESC, score DESC)
        so the actual decision message surfaces above its neighbours.
        """
        from collections import defaultdict
        conv_groups: dict[str, list[dict]] = defaultdict(list)
        no_conv: list[dict] = []

        for item in ranked:
            conv_id = item.get("conversation_id", "")
            if conv_id == "general" or not conv_id:
                no_conv.append(item)
            else:
                conv_groups[conv_id].append(item)

        result: list[dict] = list(no_conv)
        for conv_id, items in conv_groups.items():
            # Within the conversation, prefer decision messages
            items_sorted = sorted(
                items,
                key=lambda x: (x["signals"]["decision"], x["score"]),
                reverse=True,
            )
            result.extend(items_sorted[:max_per_conv])

        result.sort(key=lambda x: x["score"], reverse=True)
        return result

    def rank(
        self,
        candidates: dict[str, dict],
        query_type: str = "semantic",
        person: Optional[str] = None,
        time_range: Optional[dict] = None,
    ) -> list[dict]:
        """Produce final ranked list.

        Args:
            candidates: {msg_id: {text, sender, timestamp, semantic, lexical, ...}}
            query_type: query category
            person: required sender name (or None)
            time_range: dict with 'start' and 'end' datetime keys (or None)

        Returns:
            List of dicts sorted by final_score descending.
        """
        w = self._get_weights(query_type)
        results = []

        for msg_id, info in candidates.items():
            text = info.get("text", "")
            sender = info.get("sender", "")
            ts = info.get("timestamp")

            # ── Semantic score ─────────────────────────────────────────────
            sem = float(info.get("semantic", 0.0))

            # ── Lexical score ──────────────────────────────────────────────
            lex = float(info.get("lexical", 0.0))

            # ── Person score ───────────────────────────────────────────────
            if person and sender.lower() == person.lower():
                per = 1.0
            else:
                # Hard penalty for person queries: non-matching senders cannot win
                per = 0.0
                if person and query_type == "person":
                    # Collapse semantic score for non-matching senders
                    sem = sem * 0.25

            # ── Temporal score ─────────────────────────────────────────────
            if time_range and ts:
                if isinstance(ts, str):
                    ts = datetime.fromisoformat(ts)
                temp = _temporal_score(ts, time_range["start"], time_range["end"])
            else:
                temp = 0.0

            # ── Decision score ─────────────────────────────────────────────
            dec = decision_score(text)

            # ── Final weighted score ───────────────────────────────────────
            final = (
                w["semantic"] * sem
                + w["lexical"] * lex
                + w["person"] * per
                + w["temporal"] * temp
                + w["decision"] * dec
            )

            results.append(
                {
                    "message_id": msg_id,
                    "score": round(final, 4),
                    "signals": {
                        "semantic": round(sem, 4),
                        "lexical": round(lex, 4),
                        "person": round(per, 4),
                        "temporal": round(temp, 4),
                        "decision": round(dec, 4),
                        "final": round(final, 4),
                    },
                    **{k: v for k, v in info.items() if k not in ("semantic", "lexical")},
                }
            )

        results.sort(key=lambda x: x["score"], reverse=True)

        # Deduplicate by conversation: surface highest-decision message per thread
        # Skips dedup for person/time queries where we want all results from a sender/period
        if query_type not in ("person", "time"):
            results = self._dedup_by_conversation(results, max_per_conv=2)
        else:
            results = self._dedup_by_conversation(results, max_per_conv=4)

        return results
