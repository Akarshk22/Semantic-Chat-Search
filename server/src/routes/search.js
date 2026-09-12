import { Router } from 'express';
import { parseQuery } from '../query/queryParser.js';
import { IndexService } from '../services/indexService.js';
import { config } from '../config.js';

const router = Router();

router.post('/search', async (req, res) => {
  const t0 = performance.now();

  try {
    const { query, topK = 5, top_k } = req.body;
    const finalTopK = topK || top_k || 5;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ detail: 'Query parameter is required' });
    }

    const svc = IndexService.get();
    if (!svc.isLoaded) {
      await svc.load();
    }

    // 1. Query Parsing
    const parsed = parseQuery(query, config.referenceDate);
    const { person, timeRange, semanticQuery, queryType } = parsed;

    // 2. Query Embedding
    const queryVector = await svc.embedQuery(semanticQuery);

    // 3. Candidate Generation
    const candidateK = Math.max(finalTopK * 8, 60);
    const semanticHits = svc.semantic.search(queryVector, candidateK);
    const lexicalHits = svc.lexical.search(semanticQuery, candidateK);

    const candidates = new Map();

    for (const [msgId, score] of semanticHits) {
      const msg = svc.messagesById.get(msgId);
      if (!msg) continue;
      candidates.set(msgId, {
        text: msg.text,
        sender: msg.sender,
        timestamp: msg.timestamp,
        conversation_id: msg.conversation_id,
        semantic: score,
        lexical: 0.0
      });
    }

    for (const [msgId, score] of lexicalHits) {
      const existing = candidates.get(msgId);
      if (existing) {
        existing.lexical = score;
      } else {
        const msg = svc.messagesById.get(msgId);
        if (!msg) continue;
        candidates.set(msgId, {
          text: msg.text,
          sender: msg.sender,
          timestamp: msg.timestamp,
          conversation_id: msg.conversation_id,
          semantic: 0.0,
          lexical: score
        });
      }
    }

    // 4. Candidate Widening
    // Time queries: include messages within time range even if not in semantic top-K
    if (timeRange && queryType === 'time') {
      const startMs = timeRange.start.getTime();
      const endMs = timeRange.end.getTime();
      for (const msg of svc.messages) {
        if (!candidates.has(msg.id)) {
          const t = new Date(msg.timestamp).getTime();
          if (t >= startMs && t <= endMs) {
            candidates.set(msg.id, {
              text: msg.text,
              sender: msg.sender,
              timestamp: msg.timestamp,
              conversation_id: msg.conversation_id,
              semantic: 0.0,
              lexical: 0.0
            });
          }
        }
      }
    }

    // Person queries: include all messages from that sender in the candidate pool
    if (person && (queryType === 'person' || queryType === 'mixed')) {
      const lowerPerson = person.toLowerCase();
      for (const msg of svc.messages) {
        if (!candidates.has(msg.id) && msg.sender.toLowerCase() === lowerPerson) {
          let semScore = 0.0;
          const midIdx = svc.semantic.messageIds.indexOf(msg.id);
          if (midIdx >= 0) {
            const off = midIdx * 384;
            let dot = 0;
            for (let d = 0; d < 384; d++) {
              dot += svc.semantic.embeddings[off + d] * queryVector[d];
            }
            semScore = Math.max(0, dot);
          }

          candidates.set(msg.id, {
            text: msg.text,
            sender: msg.sender,
            timestamp: msg.timestamp,
            conversation_id: msg.conversation_id,
            semantic: semScore,
            lexical: 0.0
          });
        }
      }
    }

    // 5. Re-ranking
    const ranked = svc.reranker.rank(candidates, {
      queryType,
      person,
      timeRange
    });

    const topResults = ranked.slice(0, finalTopK);

    // 6. Context Expansion
    const results = topResults.map(item => {
      const { contextMessages } = svc.context.getContext(item.messageId, config.contextWindow);

      return {
        message_id: item.messageId,
        messageId: item.messageId,
        sender: item.sender,
        timestamp: item.timestamp,
        message: item.text,
        text: item.text,
        conversation_id: item.conversationId,
        conversationId: item.conversationId,
        score: item.score,
        signals: item.signals,
        context: contextMessages.map(cm => ({
          id: cm.id,
          sender: cm.sender,
          timestamp: cm.timestamp,
          text: cm.text,
          is_match: cm.isMatch,
          isMatch: cm.isMatch
        }))
      };
    });

    const elapsed = performance.now() - t0;

    return res.json({
      query,
      interpretation: {
        person,
        time_range: timeRange ? { label: timeRange.label } : null,
        timeRange: timeRange ? { label: timeRange.label } : null,
        semantic_query: semanticQuery,
        semanticQuery: semanticQuery,
        query_type: queryType,
        queryType: queryType
      },
      results,
      total_searched: candidates.size,
      totalSearched: candidates.size,
      search_time_ms: Number(elapsed.toFixed(1)),
      searchTimeMs: Number(elapsed.toFixed(1))
    });

  } catch (err) {
    console.error('[API /search Error]', err);
    return res.status(500).json({ detail: err.message || 'Internal server error' });
  }
});

router.get('/thread/:id', async (req, res) => {
  try {
    const threadId = req.params.id;
    const limit = parseInt(req.query.limit || '100', 10);
    const svc = IndexService.get();
    if (!svc.isLoaded) {
      await svc.load();
    }

    const messages = svc.context.getThread(threadId, limit);
    return res.json({
      conversation_id: threadId,
      conversationId: threadId,
      count: messages.length,
      messages
    });
  } catch (err) {
    console.error('[API /thread Error]', err);
    return res.status(500).json({ detail: err.message || 'Internal server error' });
  }
});

export default router;
