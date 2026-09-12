"""Semantic search using sentence-transformers embeddings.

Primary backend: NumPy cosine similarity (no extra deps, fast for ≤20k msgs).
Optional: FAISS IndexFlatIP (set USE_FAISS=true in .env).

The index is loaded from disk once and kept in memory.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import numpy as np

# FAISS is optional
try:
    import faiss  # type: ignore
    _FAISS_AVAILABLE = True
except ImportError:
    _FAISS_AVAILABLE = False


class SemanticSearchEngine:
    """Wraps an embedding matrix + FAISS/NumPy for fast retrieval."""

    def __init__(
        self,
        embeddings: np.ndarray,
        message_ids: list[str],
        use_faiss: bool = False,
    ) -> None:
        """
        Args:
            embeddings:   shape (N, D), float32, L2-normalised
            message_ids:  list of message IDs aligned with rows
            use_faiss:    use FAISS IndexFlatIP if available
        """
        self.embeddings = embeddings.astype(np.float32)
        self.message_ids = message_ids
        self.n, self.d = embeddings.shape
        self._faiss_index: Optional[object] = None

        if use_faiss and _FAISS_AVAILABLE:
            index = faiss.IndexFlatIP(self.d)
            index.add(self.embeddings)
            self._faiss_index = index

    # ── public API ───────────────────────────────────────────────────────────

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 20,
    ) -> list[tuple[str, float]]:
        """Return list of (message_id, cosine_similarity) sorted descending."""
        q = query_embedding.astype(np.float32).reshape(1, -1)
        _normalise(q)

        if self._faiss_index is not None:
            scores, indices = self._faiss_index.search(q, top_k)
            results = [
                (self.message_ids[i], float(scores[0][j]))
                for j, i in enumerate(indices[0])
                if i >= 0
            ]
            return results

        # NumPy cosine similarity (embeddings already normalised)
        sims = (self.embeddings @ q.T).ravel()
        top_idx = np.argpartition(sims, -min(top_k, self.n))[-min(top_k, self.n) :]
        top_idx = top_idx[np.argsort(sims[top_idx])[::-1]]
        return [(self.message_ids[int(i)], float(sims[i])) for i in top_idx]


def _normalise(v: np.ndarray) -> None:
    """In-place L2 normalisation along last axis."""
    norms = np.linalg.norm(v, axis=-1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    v /= norms


def load_engine(index_dir: Path) -> SemanticSearchEngine:
    """Load pre-built embeddings + metadata from disk."""
    embeddings = np.load(index_dir / "embeddings.npy")
    with open(index_dir / "meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    message_ids = meta["message_ids"]
    use_faiss = os.getenv("USE_FAISS", "false").lower() == "true"
    return SemanticSearchEngine(embeddings, message_ids, use_faiss=use_faiss)
