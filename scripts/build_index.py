"""Build FAISS/NumPy index and SQLite database from messages.json.

Run:
    python scripts/build_index.py

This script:
  1. Loads data/messages.json into SQLite
  2. Generates context-enriched embeddings for every message
  3. Saves embeddings.npy + meta.json to data/index/
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from sentence_transformers import SentenceTransformer

from backend.config import settings
from backend.services.data_loader import fetch_all_messages, load_messages_to_db

# English semantic glosses for key decision messages.
# These bridge the Hinglish-to-English semantic gap in the embedding space.
ENGLISH_GLOSSES: dict[str, str] = {
    "msg_D001": "yes we finally agreed to go to Manali, leaving on the 18th",
    "msg_D002": "trip confirmed from 18th to 22nd August, 4 nights plan finalized",
    "msg_D003": "we will take an overnight Volvo bus, costs 1400 per head, AC and comfortable",
    "msg_D004": "Zostel Manali both rooms confirmed, 2800 per night split between everyone",
    "msg_D005": "total budget max 12k per head including all travel costs",
    "msg_D006": "Pyaar restaurant is confirmed for Saturday 8pm reservation",
    "msg_D007": "table booked 8 seater in Priya's name",
    "msg_D008": "React and Node finalized as tech stack, client approved, starting now",
    "msg_D009": "three weeks to deliver MVP, deadline is October 5th",
    "msg_D010": "cannot exceed 15k spending limit, budget is tight",
    "msg_D011": "dropping Rishikesh idea because it was too crowded last time",
    "msg_D012": "Goa in July has too much rain, avoid monsoon season",
    "msg_D013": "dropping Vue because nobody in the team knows it well enough",
    "msg_D014": "Olive Garden booking cancelled, too expensive for 8 people",
    "msg_D015": "do not use Angular, the learning curve is too steep for our timeline",
}


def build_context_text(msg: dict, all_msgs: list[dict], idx: int, window: int = 3) -> str:
    """Build enriched text: prepend N preceding messages for context.

    Short messages (≤ 8 chars) get wider context to improve retrieval.
    """
    text = msg["text"].strip()
    is_short = len(text.split()) <= 4

    ctx_window = window + 2 if is_short else window
    conv_id = msg["conversation_id"]

    # Gather preceding messages from the same conversation
    preceding = []
    for j in range(max(0, idx - ctx_window), idx):
        m = all_msgs[j]
        if m["conversation_id"] == conv_id:
            preceding.append(f"{m['sender']}: {m['text']}")

    if preceding:
        context_prefix = " | ".join(preceding) + " | "
    else:
        context_prefix = ""

    # Format: "Context | Sender: message | message" — repeat message to upweight it
    # This counteracts context contamination from surrounding messages
    base = f"{context_prefix}{msg['sender']}: {text} | {text}"

    # For key decision messages, append English gloss to bridge Hinglish→English gap
    msg_id = msg.get("id", "")
    if msg_id in ENGLISH_GLOSSES:
        base = f"{base} | {ENGLISH_GLOSSES[msg_id]}"

    return base


def main() -> None:
    settings.index_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Load into SQLite ───────────────────────────────────────────────
    print(f"Loading {settings.messages_path} → SQLite …")
    n = load_messages_to_db(settings.messages_path, settings.db_path)
    print(f"  {n} messages loaded into {settings.db_path}")

    # ── 2. Load model ─────────────────────────────────────────────────────
    print(f"Loading model: {settings.embedding_model} …")
    model = SentenceTransformer(settings.embedding_model)

    # ── 3. Build context-enriched texts ───────────────────────────────────
    print("Building context-enriched texts …")
    all_msgs = fetch_all_messages(settings.db_path)
    message_ids = [m["id"] for m in all_msgs]
    texts = [
        build_context_text(msg, all_msgs, i)
        for i, msg in enumerate(all_msgs)
    ]

    print(f"  {len(texts)} context texts built")
    print("  Sample:", texts[0][:120])

    # ── 4. Encode ──────────────────────────────────────────────────────────
    print("Encoding … (this may take a few minutes on first run)")
    batch_size = 128
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=True,
    )
    embeddings = embeddings.astype(np.float32)
    print(f"  Embedding shape: {embeddings.shape}")

    # ── 5. Save ────────────────────────────────────────────────────────────
    np.save(str(settings.embeddings_path), embeddings)
    with open(settings.meta_path, "w", encoding="utf-8") as f:
        json.dump({"message_ids": message_ids, "model": settings.embedding_model}, f)

    print(f"Saved embeddings → {settings.embeddings_path}")
    print(f"Saved metadata  → {settings.meta_path}")
    print("\nIndex build complete ✓")


if __name__ == "__main__":
    main()
