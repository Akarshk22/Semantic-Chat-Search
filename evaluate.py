"""Evaluation script — runs all 40 test queries through the retrieval pipeline.

Run:
    python evaluate.py

Reports:
  - Overall Recall@1, @3, @5
  - Mean Reciprocal Rank (MRR)
  - Per-category breakdown (semantic / person / time / mixed)
  - Hard-query (zero-overlap) breakdown
  - Individual failures with diagnosis
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
from sentence_transformers import SentenceTransformer

from backend.config import settings
from backend.retrieval.context_expander import ContextExpander
from backend.retrieval.query_parser import parse_query
from backend.retrieval.reranker import Reranker
from backend.services.data_loader import fetch_all_messages
from backend.retrieval.lexical_search import LexicalSearchEngine
from backend.retrieval.semantic_search import SemanticSearchEngine


def load_system() -> dict:
    """Load all components needed for evaluation."""
    print(f"Loading model: {settings.embedding_model} …")
    model = SentenceTransformer(settings.embedding_model)

    print("Loading embeddings …")
    embeddings = np.load(str(settings.embeddings_path))
    with open(settings.meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    message_ids = meta["message_ids"]

    print("Loading messages from SQLite …")
    all_msgs = fetch_all_messages(settings.db_path)
    messages_by_id = {m["id"]: m for m in all_msgs}

    print("Building BM25 index …")
    docs = [messages_by_id[mid]["text"] for mid in message_ids]
    lexical = LexicalSearchEngine(docs, message_ids)
    semantic = SemanticSearchEngine(embeddings, message_ids)

    return {
        "model": model,
        "semantic": semantic,
        "lexical": lexical,
        "messages_by_id": messages_by_id,
        "all_msgs": all_msgs,
        "reranker": Reranker(),
        "context_expander": ContextExpander(settings.db_path),
    }


def run_query(
    query: str,
    system: dict,
    reference_date: datetime,
    top_k: int = 5,
) -> list[str]:
    """Run a single query and return ranked message IDs."""
    parsed = parse_query(query, reference_date)
    person = parsed["person"]
    time_range = parsed["time_range"]
    query_type = parsed["query_type"]
    semantic_query = parsed["semantic_query"]

    # Embed
    q_vec = system["model"].encode(
        [semantic_query], normalize_embeddings=True, convert_to_numpy=True
    )[0]

    candidate_k = max(top_k * 10, 80)

    # Semantic + lexical candidates
    sem_hits = system["semantic"].search(q_vec, top_k=candidate_k)
    lex_hits = system["lexical"].search(semantic_query, top_k=candidate_k)

    candidates: dict[str, dict] = {}
    for mid, score in sem_hits:
        msg = system["messages_by_id"].get(mid, {})
        candidates[mid] = {
            "text": msg.get("text", ""),
            "sender": msg.get("sender", ""),
            "timestamp": msg.get("timestamp", ""),
            "conversation_id": msg.get("conversation_id", ""),
            "semantic": score,
            "lexical": 0.0,
        }
    for mid, score in lex_hits:
        if mid in candidates:
            candidates[mid]["lexical"] = score
        else:
            msg = system["messages_by_id"].get(mid, {})
            candidates[mid] = {
                "text": msg.get("text", ""),
                "sender": msg.get("sender", ""),
                "timestamp": msg.get("timestamp", ""),
                "conversation_id": msg.get("conversation_id", ""),
                "semantic": 0.0,
                "lexical": score,
            }

    # Widen candidates for time queries
    if time_range and query_type == "time":
        start_ts = time_range["start"].isoformat()
        end_ts = time_range["end"].isoformat()
        for msg in system["all_msgs"]:
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

    # Widen candidates for person queries — include ALL messages by that person
    if person and query_type in ("person", "mixed"):
        for msg in system["all_msgs"]:
            if msg["id"] not in candidates and msg["sender"].lower() == person.lower():
                candidates[msg["id"]] = {
                    "text": msg["text"],
                    "sender": msg["sender"],
                    "timestamp": msg["timestamp"],
                    "conversation_id": msg["conversation_id"],
                    "semantic": 0.0,
                    "lexical": 0.0,
                }

    ranked = system["reranker"].rank(
        candidates, query_type=query_type, person=person, time_range=time_range
    )
    return [r["message_id"] for r in ranked[:top_k]]


def recall_at_k(ranked: list[str], answer: str, k: int) -> bool:
    return answer in ranked[:k]


def reciprocal_rank(ranked: list[str], answer: str) -> float:
    try:
        idx = ranked.index(answer)
        return 1.0 / (idx + 1)
    except ValueError:
        return 0.0


def main() -> None:
    if not settings.embeddings_path.exists():
        print("ERROR: Index not built. Run: python scripts/build_index.py")
        sys.exit(1)

    with open(settings.queries_path, encoding="utf-8") as f:
        queries = json.load(f)

    system = load_system()
    reference_date = datetime(2026, 9, 12)

    print(f"\n{'='*60}")
    print(f"Running {len(queries)} evaluation queries …")
    print(f"{'='*60}\n")

    results_by_cat: dict[str, list] = {}
    hard_results: list[dict] = []
    all_results: list[dict] = []
    mrr_scores: list[float] = []

    t0 = time.perf_counter()

    for q in queries:
        qid = q["query_id"]
        query_text = q["query"]
        answer_id = q["answer_message_id"]
        category = q.get("category", "semantic")
        is_hard = q.get("hard", False)

        ranked = run_query(query_text, system, reference_date, top_k=5)

        r1 = recall_at_k(ranked, answer_id, 1)
        r3 = recall_at_k(ranked, answer_id, 3)
        r5 = recall_at_k(ranked, answer_id, 5)
        rr = reciprocal_rank(ranked, answer_id)

        result = {
            "query_id": qid,
            "query": query_text,
            "answer_id": answer_id,
            "category": category,
            "hard": is_hard,
            "ranked": ranked,
            "r@1": r1,
            "r@3": r3,
            "r@5": r5,
            "rr": rr,
        }

        all_results.append(result)
        mrr_scores.append(rr)

        cat_list = results_by_cat.setdefault(category, [])
        cat_list.append(result)
        if is_hard:
            hard_results.append(result)

        status = "✓" if r1 else ("~" if r3 else "✗")
        print(f"  {status} [{qid}] {query_text[:55]:<55} rank={ranked.index(answer_id)+1 if answer_id in ranked else '>5'}")

    elapsed = time.perf_counter() - t0

    # ── Aggregate metrics ─────────────────────────────────────────────────
    def pct(n, d):
        return f"{n/d*100:.1f}%" if d else "N/A"

    n = len(all_results)
    r1_all = sum(r["r@1"] for r in all_results)
    r3_all = sum(r["r@3"] for r in all_results)
    r5_all = sum(r["r@5"] for r in all_results)
    mrr = sum(mrr_scores) / len(mrr_scores) if mrr_scores else 0

    print(f"\n{'='*60}")
    print("OVERALL RESULTS")
    print(f"{'='*60}")
    print(f"  {'Metric':<30} {'Value':>10}")
    print(f"  {'-'*40}")
    print(f"  {'Recall@1':<30} {pct(r1_all, n):>10}  ({r1_all}/{n})")
    print(f"  {'Recall@3':<30} {pct(r3_all, n):>10}  ({r3_all}/{n})")
    print(f"  {'Recall@5':<30} {pct(r5_all, n):>10}  ({r5_all}/{n})")
    print(f"  {'MRR':<30} {mrr:.4f}    ")

    print(f"\n{'='*60}")
    print("HARD (ZERO-OVERLAP) QUERIES")
    print(f"{'='*60}")
    nh = len(hard_results)
    rh1 = sum(r["r@1"] for r in hard_results)
    rh3 = sum(r["r@3"] for r in hard_results)
    rh5 = sum(r["r@5"] for r in hard_results)
    print(f"  {'Recall@1':<30} {pct(rh1, nh):>10}  ({rh1}/{nh})")
    print(f"  {'Recall@3':<30} {pct(rh3, nh):>10}  ({rh3}/{nh})")
    print(f"  {'Recall@5':<30} {pct(rh5, nh):>10}  ({rh5}/{nh})")

    print(f"\n{'='*60}")
    print("PER-CATEGORY BREAKDOWN")
    print(f"{'='*60}")
    for cat, cat_results in sorted(results_by_cat.items()):
        nc = len(cat_results)
        rc1 = sum(r["r@1"] for r in cat_results)
        rc3 = sum(r["r@3"] for r in cat_results)
        print(f"  {cat.upper():<12}  R@1={pct(rc1, nc)}  R@3={pct(rc3, nc)}  ({nc} queries)")

    # ── Failures ──────────────────────────────────────────────────────────
    failures = [r for r in all_results if not r["r@5"]]
    near_misses = [r for r in all_results if not r["r@1"] and r["r@5"]]

    if failures:
        print(f"\n{'='*60}")
        print(f"FAILURES (not in top-5): {len(failures)}")
        print(f"{'='*60}")
        for r in failures:
            tag = "[HARD]" if r["hard"] else ""
            print(f"  {tag} [{r['query_id']}] {r['query'][:60]}")
            print(f"       answer: {r['answer_id']}")
            print(f"       top-5 returned: {r['ranked']}")

    if near_misses:
        print(f"\n{'='*60}")
        print(f"NEAR MISSES (rank 2-5): {len(near_misses)}")
        print(f"{'='*60}")
        for r in near_misses:
            rank = r["ranked"].index(r["answer_id"]) + 1
            tag = "[HARD]" if r["hard"] else ""
            print(f"  {tag} [{r['query_id']}] rank={rank}  {r['query'][:55]}")

    print(f"\n{'='*60}")
    print(f"Evaluation complete in {elapsed:.1f}s")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
