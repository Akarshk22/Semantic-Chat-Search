"""Central configuration – all env-vars loaded here."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (two levels up from this file)
_root = Path(__file__).parent.parent
load_dotenv(_root / ".env")


class Settings:
    # Paths
    data_dir: Path = Path(os.getenv("DATA_DIR", "data"))
    index_dir: Path = Path(os.getenv("INDEX_DIR", "data/index"))
    messages_path: Path = data_dir / "messages.json"
    queries_path: Path = data_dir / "test_queries.json"
    db_path: Path = index_dir / "messages.db"
    embeddings_path: Path = index_dir / "embeddings.npy"
    faiss_path: Path = index_dir / "faiss.index"
    meta_path: Path = index_dir / "meta.json"

    # Embedding model
    embedding_model: str = os.getenv(
        "EMBEDDING_MODEL",
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    )

    # Retrieval weights (base – may be overridden per query type)
    weight_semantic: float = float(os.getenv("WEIGHT_SEMANTIC", "0.55"))
    weight_lexical: float = float(os.getenv("WEIGHT_LEXICAL", "0.15"))
    weight_person: float = float(os.getenv("WEIGHT_PERSON", "0.10"))
    weight_temporal: float = float(os.getenv("WEIGHT_TEMPORAL", "0.10"))
    weight_decision: float = float(os.getenv("WEIGHT_DECISION", "0.10"))

    # Context expansion
    context_window: int = int(os.getenv("CONTEXT_WINDOW", "3"))

    # Search
    default_top_k: int = int(os.getenv("DEFAULT_TOP_K", "5"))

    # Reference date for relative time expressions
    reference_date: str | None = os.getenv("REFERENCE_DATE") or None

    # Server
    host: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    port: int = int(os.getenv("BACKEND_PORT", "8000"))


settings = Settings()
