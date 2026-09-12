/**
 * Candidate fusion and re-ranking in JavaScript.
 * Combines signals from:
 *   - semantic similarity
 *   - lexical (BM25) score
 *   - person match
 *   - temporal proximity
 *   - decision heuristic
 */

import { decisionScore } from './decisionScore.js';
import { temporalScore } from '../query/temporalParser.js';

export class Reranker {
  constructor(weights = {}) {
    this.baseWeights = {
      semantic: weights.weightSemantic ?? 0.55,
      lexical: weights.weightLexical ?? 0.15,
      person: weights.weightPerson ?? 0.10,
      temporal: weights.weightTemporal ?? 0.10,
      decision: weights.weightDecision ?? 0.10,
    };
  }

  _getWeights(queryType) {
    const w = { ...this.baseWeights };
    if (queryType === 'person') {
      const boost = 0.15;
      w.person += boost;
      w.semantic -= boost * 0.5;
      w.temporal -= boost * 0.5;
    } else if (queryType === 'time') {
      const boost = 0.15;
      w.temporal += boost;
      w.semantic -= boost * 0.5;
      w.person -= boost * 0.5;
    } else if (queryType === 'mixed') {
      w.person += 0.08;
      w.temporal += 0.08;
      w.semantic -= 0.10;
      w.lexical -= 0.03;
      w.decision -= 0.03;
    }

    const total = Object.values(w).reduce((acc, v) => acc + v, 0);
    const normalized = {};
    for (const [k, v] of Object.entries(w)) {
      normalized[k] = Math.max(0.0, v / total);
    }
    return normalized;
  }

  _dedupByConversation(ranked, maxPerConv = 2) {
    const convGroups = new Map();
    const noConv = [];

    for (const item of ranked) {
      const convId = item.conversationId || item.conversation_id;
      if (!convId || convId === 'general') {
        noConv.push(item);
      } else {
        let group = convGroups.get(convId);
        if (!group) {
          group = [];
          convGroups.set(convId, group);
        }
        group.push(item);
      }
    }

    const result = [...noConv];
    for (const [, items] of convGroups.entries()) {
      // Within the conversation, prefer decision messages first, then composite score
      items.sort((a, b) => {
        const decDiff = b.signals.decision - a.signals.decision;
        if (Math.abs(decDiff) > 0.05) return decDiff;
        return b.score - a.score;
      });
      result.push(...items.slice(0, maxPerConv));
    }

    result.sort((a, b) => b.score - a.score);
    return result;
  }

  /**
   * Rank all candidates into a sorted list.
   * @param {Map<string, object>|object} candidatesMap 
   * @param {object} options 
   * @returns {Array<object>}
   */
  rank(candidatesMap, { queryType = 'semantic', person = null, timeRange = null } = {}) {
    const w = this._getWeights(queryType);
    const entries = candidatesMap instanceof Map ? candidatesMap.entries() : Object.entries(candidatesMap);

    const results = [];

    for (const [msgId, info] of entries) {
      const text = info.text || '';
      const sender = info.sender || '';
      const ts = info.timestamp ? new Date(info.timestamp) : null;

      // 1. Semantic score
      let sem = Number(info.semantic || 0.0);

      // 2. Lexical score
      const lex = Number(info.lexical || 0.0);

      // 3. Person score
      let per = 0.0;
      if (person && sender.toLowerCase() === person.toLowerCase()) {
        per = 1.0;
      } else if (person && queryType === 'person') {
        // Hard penalty for person queries: non-matching senders cannot win
        sem *= 0.25;
      }

      // 4. Temporal score
      let temp = 0.0;
      if (timeRange && ts && !isNaN(ts.getTime())) {
        temp = temporalScore(ts, timeRange.start, timeRange.end);
      }

      // 5. Decision score
      const dec = decisionScore(text);

      // Final weighted combination
      const finalScore = (
        w.semantic * sem +
        w.lexical * lex +
        w.person * per +
        w.temporal * temp +
        w.decision * dec
      );

      results.push({
        messageId: msgId,
        score: Number(finalScore.toFixed(4)),
        sender,
        timestamp: info.timestamp,
        text,
        conversationId: info.conversation_id || 'general',
        signals: {
          semantic: Number(sem.toFixed(4)),
          lexical: Number(lex.toFixed(4)),
          person: Number(per.toFixed(4)),
          temporal: Number(temp.toFixed(4)),
          decision: Number(dec.toFixed(4)),
          final: Number(finalScore.toFixed(4))
        }
      });
    }

    results.sort((a, b) => b.score - a.score);

    // Deduplicate near-identical conversation flooding
    const maxPerConv = (queryType === 'person' || queryType === 'time') ? 4 : 2;
    return this._dedupByConversation(results, maxPerConv);
  }
}
