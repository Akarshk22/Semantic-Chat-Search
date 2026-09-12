"""BM25-based lexical search over chat messages."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

from rank_bm25 import BM25Okapi


_STOPWORDS = {
    "the", "a", "an", "is", "it", "in", "on", "at", "to", "of",
    "and", "or", "for", "with", "that", "this", "was", "are", "be",
    "did", "do", "does", "has", "have", "had", "will", "would",
    "what", "when", "where", "why", "who", "how",
    # Hinglish particles
    "hai", "hain", "tha", "the", "thi", "ko", "ka", "ki", "ke",
    "se", "ne", "mein", "par", "pe", "bhi", "hi", "na", "nahi",
    "aur", "ya", "to", "toh",
}


def _tokenize(text: str) -> list[str]:
    """Lower-case, remove punctuation, split, remove stopwords."""
    text = unicodedata.normalize("NFKC", text.lower())
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = [t for t in text.split() if t and t not in _STOPWORDS and len(t) > 1]
    return tokens


class LexicalSearchEngine:
    def __init__(self, documents: list[str], message_ids: list[str]) -> None:
        self.message_ids = message_ids
        self._tokenized = [_tokenize(d) for d in documents]
        self.bm25 = BM25Okapi(self._tokenized)

    def search(self, query: str, top_k: int = 20) -> list[tuple[str, float]]:
        """Return list of (message_id, normalised_bm25_score)."""
        tokens = _tokenize(query)
        if not tokens:
            return []
        scores = self.bm25.get_scores(tokens)
        # Normalise to [0, 1]
        max_score = float(scores.max()) if scores.max() > 0 else 1.0
        normed = scores / max_score

        top_idx = normed.argsort()[::-1][:top_k]
        return [(self.message_ids[int(i)], float(normed[i])) for i in top_idx]
