"""Data loader: reads messages.json and populates SQLite database."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    timestamp       TEXT NOT NULL,
    sender          TEXT NOT NULL,
    text            TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    message_type    TEXT NOT NULL DEFAULT 'text'
);
CREATE INDEX IF NOT EXISTS idx_sender    ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_ts        ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_conv      ON messages(conversation_id);
"""


def load_messages_to_db(messages_path: Path, db_path: Path) -> int:
    """Load messages.json into SQLite. Returns number of rows inserted."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with open(messages_path, encoding="utf-8") as f:
        messages = json.load(f)

    conn = sqlite3.connect(str(db_path))
    conn.executescript(CREATE_TABLE)
    conn.execute("DELETE FROM messages")  # clear before reload

    rows = [
        (
            m["id"],
            m["timestamp"],
            m["sender"],
            m["text"],
            m["conversation_id"],
            m.get("message_type", "text"),
        )
        for m in messages
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO messages VALUES (?,?,?,?,?,?)", rows
    )
    conn.commit()
    conn.close()
    return len(rows)


def fetch_all_messages(db_path: Path) -> list[dict]:
    """Return all messages ordered by timestamp."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, timestamp, sender, text, conversation_id, message_type "
        "FROM messages ORDER BY timestamp ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_message_by_id(db_path: Path, msg_id: str) -> dict | None:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, timestamp, sender, text, conversation_id, message_type "
        "FROM messages WHERE id = ?",
        (msg_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None
