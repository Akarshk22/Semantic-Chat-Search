"""Singleton index service: loads models and indexes once at startup."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from ..config import settings
from ..retrieval.semantic_search import SemanticSearchEngine, _normalise
from ..retrieval.lexical_search import LexicalSearchEngine
from ..services.data_loader import fetch_all_messages


class IndexService:
    """Global singleton holding all in-memory indexes."""

    _instance: Optional["IndexService"] = None

    def __init__(self) -> None:
        self.model: Optional[SentenceTransformer] = None
        self.semantic: Optional[SemanticSearchEngine] = None
        self.lexical: Optional[LexicalSearchEngine] = None
        self.messages_by_id: dict[str, dict] = {}
        self.ordered_messages: list[dict] = []
        self._loaded = False

    @classmethod
    def get(cls) -> "IndexService":
        if cls._instance is None:
            cls._instance = IndexService()
        return cls._instance

    def load(self) -> None:
        if self._loaded:
            return

        index_dir = settings.index_dir
        db_path = settings.db_path

        print(f"[IndexService] Loading embedding model: {settings.embedding_model}")
        self.model = SentenceTransformer(settings.embedding_model)

        print("[IndexService] Loading messages from SQLite …")
        self.ordered_messages = fetch_all_messages(db_path)
        self.messages_by_id = {m["id"]: m for m in self.ordered_messages}

        print("[IndexService] Loading embeddings …")
        embeddings = np.load(str(index_dir / "embeddings.npy"))

        with open(index_dir / "meta.json", encoding="utf-8") as f:
            meta = json.load(f)
        message_ids = meta["message_ids"]

        self.semantic = SemanticSearchEngine(embeddings, message_ids)

        print("[IndexService] Building BM25 index …")
        docs = [self.messages_by_id[mid]["text"] for mid in message_ids]
        self.lexical = LexicalSearchEngine(docs, message_ids)

        self._loaded = True
        print(f"[IndexService] Ready — {len(self.ordered_messages)} messages indexed.")

    def embed_query(self, text: str) -> np.ndarray:
        """Embed a query string and L2-normalise."""
        vec = self.model.encode([text], convert_to_numpy=True, normalize_embeddings=True)
        return vec[0]

    def get_message(self, msg_id: str) -> Optional[dict]:
        return self.messages_by_id.get(msg_id)
