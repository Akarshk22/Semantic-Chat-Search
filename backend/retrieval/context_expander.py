"""Context expander: retrieve surrounding messages for a matched message."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..config import settings


def _row_to_dict(row) -> dict:
    return {
        "id": row[0],
        "timestamp": datetime.fromisoformat(row[1]),
        "sender": row[2],
        "text": row[3],
        "conversation_id": row[4],
        "message_type": row[5],
    }


class ContextExpander:
    """Loads conversation context from SQLite."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def get_context(
        self,
        message_id: str,
        window: int = 3,
    ) -> tuple[list[dict], int]:
        """Return (context_messages, match_index_in_list).

        context_messages is a list of message dicts centred on the matched message.
        match_index is the position of the matched message in the list.
        """
        conn = self._connect()
        try:
            # Get the matched message first
            row = conn.execute(
                "SELECT id, timestamp, sender, text, conversation_id, message_type "
                "FROM messages WHERE id = ?",
                (message_id,),
            ).fetchone()
            if row is None:
                return [], 0

            msg = _row_to_dict(row)
            conv_id = msg["conversation_id"]
            ts = msg["timestamp"]

            # Fetch window messages before
            before_rows = conn.execute(
                "SELECT id, timestamp, sender, text, conversation_id, message_type "
                "FROM messages "
                "WHERE conversation_id = ? AND timestamp < ? "
                "ORDER BY timestamp DESC LIMIT ?",
                (conv_id, ts.isoformat(), window),
            ).fetchall()
            before = [_row_to_dict(r) for r in reversed(before_rows)]

            # Fetch window messages after
            after_rows = conn.execute(
                "SELECT id, timestamp, sender, text, conversation_id, message_type "
                "FROM messages "
                "WHERE conversation_id = ? AND timestamp > ? "
                "ORDER BY timestamp ASC LIMIT ?",
                (conv_id, ts.isoformat(), window),
            ).fetchall()
            after = [_row_to_dict(r) for r in after_rows]

            context = before + [msg] + after
            match_idx = len(before)
            return context, match_idx

        finally:
            conn.close()

    def get_thread_messages(
        self,
        conversation_id: str,
        limit: int = 50,
    ) -> list[dict]:
        """Fetch recent messages from a thread (for 'View full thread')."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT id, timestamp, sender, text, conversation_id, message_type "
                "FROM messages WHERE conversation_id = ? "
                "ORDER BY timestamp ASC LIMIT ?",
                (conversation_id, limit),
            ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            conn.close()
