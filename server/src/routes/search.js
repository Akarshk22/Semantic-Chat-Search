import { Router } from 'express';
import { parseQuery } from '../query/queryParser.js';
import { IndexService } from '../services/indexService.js';
import { config } from '../config.js';

const router = Router();

router.post('/search', async (req, res) => {
  const t0 = performance.now();

  try {
    const { query = '', topK = 5, top_k, filters = {} } = req.body;
    const finalTopK = topK || top_k || 5;

    const {
      participants = [],
      startDate = null,
      endDate = null,
      conversationId = null
    } = filters || {};

    const hasFilters = (Array.isArray(participants) && participants.length > 0) ||
      Boolean(startDate) || Boolean(endDate) || (conversationId && conversationId !== 'all');

    const effectiveQuery = (query && typeof query === 'string' && query.trim()) ? query.trim() : '';

    if (!effectiveQuery && !hasFilters) {
      return res.status(400).json({ detail: 'Query parameter or filter criteria is required' });
    }

    const svc = IndexService.get();
    if (!svc.isLoaded) {
      await svc.load();
    }

    // 1. Faceted filter predicates
    const selectedParticipants = Array.isArray(participants) && participants.length > 0
      ? new Set(participants.map(p => p.toLowerCase()))
      : null;

    const filterStartMs = startDate ? new Date(startDate).getTime() : null;
    const filterEndMs = endDate ? (endDate.length <= 10 ? new Date(`${endDate}T23:59:59.999Z`).getTime() : new Date(endDate).getTime()) : null;

    const matchesFilters = (m) => {
      if (!m) return false;
      if (selectedParticipants && !selectedParticipants.has(m.sender.toLowerCase())) {
        return false;
      }
      if (conversationId && conversationId !== 'all' && m.conversation_id !== conversationId) {
        return false;
      }
      if (filterStartMs || filterEndMs) {
        const t = new Date(m.timestamp).getTime();
        if (filterStartMs && t < filterStartMs) return false;
        if (filterEndMs && t > filterEndMs) return false;
      }
      return true;
    };

    const isValidCandidate = (m) => {
      if (!m) return false;
      if (m.message_type === 'system' || m.message_type === 'reaction') return false;
      if (m.text && (m.text.includes('left the group') || m.text.includes('joined the group'))) return false;
      return matchesFilters(m);
    };

    // 2. Query Parsing
    const parsed = effectiveQuery
      ? parseQuery(effectiveQuery, config.referenceDate)
      : { person: null, timeRange: null, semanticQuery: '', queryType: 'semantic' };
    const { person, timeRange, semanticQuery, queryType } = parsed;

    // 3. Candidate Generation
    const candidates = new Map();

    if (effectiveQuery) {
      const queryVector = await svc.embedQuery(semanticQuery || effectiveQuery);
      const candidateK = Math.max(finalTopK * 8, 80);
      const semanticHits = svc.semantic.search(queryVector, candidateK);
      const lexicalHits = svc.lexical.search(semanticQuery || effectiveQuery, candidateK);

      for (const [msgId, score] of semanticHits) {
        const msg = svc.messagesById.get(msgId);
        if (!isValidCandidate(msg)) continue;
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
          if (!isValidCandidate(msg)) continue;
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

      // When faceted filters are active, compute true semantic scores across matching candidates
      if (hasFilters) {
        for (const msg of svc.messages) {
          if (!candidates.has(msg.id) && isValidCandidate(msg)) {
            const midIdx = svc.semantic.messageIds.indexOf(msg.id);
            let dot = 0.0;
            if (midIdx >= 0) {
              const off = midIdx * 384;
              for (let d = 0; d < 384; d++) {
                dot += svc.semantic.embeddings[off + d] * queryVector[d];
              }
            }
            if (dot > 0.15) {
              candidates.set(msg.id, {
                text: msg.text,
                sender: msg.sender,
                timestamp: msg.timestamp,
                conversation_id: msg.conversation_id,
                semantic: Math.max(0, Number(dot.toFixed(4))),
                lexical: 0.0
              });
            }
          }
        }
      }
    } else {
      // Empty query with active filters: surface top decision / recent messages in filter
      for (const msg of svc.messages) {
        if (isValidCandidate(msg)) {
          candidates.set(msg.id, {
            text: msg.text,
            sender: msg.sender,
            timestamp: msg.timestamp,
            conversation_id: msg.conversation_id,
            semantic: 0.2,
            lexical: 0.0
          });
          if (candidates.size >= 150) break;
        }
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

router.get('/filters', async (req, res) => {
  try {
    const svc = IndexService.get();
    if (!svc.isLoaded) {
      await svc.load();
    }

    const participantCounts = {};
    const conversationCounts = {};
    let minDate = null;
    let maxDate = null;

    const topicLabels = {
      trip_manali: 'Trip to Manali',
      birthday_restaurant: "Sneha's Birthday",
      project_techstack: 'Project Tech Stack',
      general: 'General Chat'
    };

    for (const msg of svc.messages) {
      if (msg.message_type !== 'text') continue;
      if (msg.sender) {
        participantCounts[msg.sender] = (participantCounts[msg.sender] || 0) + 1;
      }
      const cid = msg.conversation_id || 'general';
      conversationCounts[cid] = (conversationCounts[cid] || 0) + 1;

      if (msg.timestamp) {
        if (!minDate || msg.timestamp < minDate) minDate = msg.timestamp;
        if (!maxDate || msg.timestamp > maxDate) maxDate = msg.timestamp;
      }
    }

    const participants = Object.entries(participantCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const conversations = Object.entries(conversationCounts)
      .map(([id, count]) => ({
        id,
        label: topicLabels[id] || id,
        count
      }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      participants,
      conversations,
      dateRange: {
        minDate: minDate ? minDate.slice(0, 10) : '2026-03-01',
        maxDate: maxDate ? maxDate.slice(0, 10) : '2026-08-31'
      }
    });
  } catch (err) {
    console.error('[API /filters Error]', err);
    return res.status(500).json({ detail: err.message || 'Internal server error' });
  }
});

export default router;
