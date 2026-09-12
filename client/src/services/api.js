/**
 * Client API service for search and thread retrieval.
 */

export async function searchArchive(query, topK = 5) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK, topK }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Search failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchThread(conversationId, limit = 60) {
  const res = await fetch(`/api/thread/${encodeURIComponent(conversationId)}?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to load thread with status ${res.status}`);
  }
  return res.json();
}
