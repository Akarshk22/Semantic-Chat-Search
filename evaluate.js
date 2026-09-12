/**
 * End-to-end Evaluation Benchmark Suite in Pure JavaScript.
 * Runs all 40 test queries against the Node.js search engine.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IndexService } from './server/src/services/indexService.js';
import { parseQuery } from './server/src/query/queryParser.js';
import { config } from './server/src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUERIES_PATH = fs.existsSync(path.join(__dirname, 'data', 'testQueries.json'))
  ? path.join(__dirname, 'data', 'testQueries.json')
  : path.join(__dirname, 'data', 'test_queries.json');

async function runSingleQuery(svc, queryText, topK = 5) {
  const parsed = parseQuery(queryText, config.referenceDate);
  const { person, timeRange, semanticQuery, queryType } = parsed;

  const queryVector = await svc.embedQuery(semanticQuery);

  const candidateK = Math.max(topK * 10, 80);
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

  // Time widening
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

  // Person widening
  if (person && (queryType === 'person' || queryType === 'mixed')) {
    const lowerPerson = person.toLowerCase();
    for (const msg of svc.messages) {
      if (!candidates.has(msg.id) && msg.sender.toLowerCase() === lowerPerson) {
        // Calculate true semantic similarity
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

  const ranked = svc.reranker.rank(candidates, {
    queryType,
    person,
    timeRange
  });

  return ranked.map(r => r.messageId);
}

async function main() {
  console.log("=".repeat(60));
  console.log("Starting Evaluation Benchmark (JavaScript / Node.js)");
  console.log("=".repeat(60) + "\n");

  const svc = IndexService.get();
  await svc.load();

  const queries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf8'));
  console.log(`\nEvaluating ${queries.length} test queries...\n`);

  const t0 = performance.now();
  let hitsAt1 = 0;
  let hitsAt3 = 0;
  let hitsAt5 = 0;
  let mrrSum = 0;

  const hardQueries = [];
  const byCategory = {};

  const queryOutputs = [];

  for (const q of queries) {
    const qid = q.query_id;
    const query = q.query;
    const answerId = q.answer_message_id;
    const category = q.category || 'SEMANTIC';
    const isHard = Boolean(q.hard);

    const ranked = await runSingleQuery(svc, query, 5);
    const rank = ranked.indexOf(answerId) + 1; // 1-based, 0 if not found

    const r1 = rank === 1;
    const r3 = rank > 0 && rank <= 3;
    const r5 = rank > 0 && rank <= 5;
    const rr = rank > 0 ? 1.0 / rank : 0.0;

    if (r1) hitsAt1++;
    if (r3) hitsAt3++;
    if (r5) hitsAt5++;
    mrrSum += rr;

    const catKey = category.toUpperCase();
    if (!byCategory[catKey]) {
      byCategory[catKey] = { total: 0, r1: 0, r3: 0, r5: 0 };
    }
    byCategory[catKey].total++;
    if (r1) byCategory[catKey].r1++;
    if (r3) byCategory[catKey].r3++;
    if (r5) byCategory[catKey].r5++;

    if (isHard) {
      hardQueries.push({ qid, query, answerId, rank, r1, r3, r5, rr, ranked });
    }

    const mark = r1 ? "✓" : (r3 ? "~" : "✗");
    const rankStr = rank > 0 ? `rank=${rank}` : "rank=>5";
    console.log(`  ${mark} [${qid}] ${query.padEnd(58)} ${rankStr}`);

    queryOutputs.push({ qid, query, answerId, rank, ranked: ranked.slice(0, 5) });
  }

  const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
  const totalQueries = queries.length;

  const r1Pct = ((hitsAt1 / totalQueries) * 100).toFixed(1);
  const r3Pct = ((hitsAt3 / totalQueries) * 100).toFixed(1);
  const r5Pct = ((hitsAt5 / totalQueries) * 100).toFixed(1);
  const mrr = (mrrSum / totalQueries).toFixed(4);

  const hardTotal = hardQueries.length;
  const hardR1 = hardQueries.filter(q => q.r1).length;
  const hardR3 = hardQueries.filter(q => q.r3).length;
  const hardR5 = hardQueries.filter(q => q.r5).length;
  const hardR1Pct = ((hardR1 / hardTotal) * 100).toFixed(1);
  const hardR3Pct = ((hardR3 / hardTotal) * 100).toFixed(1);
  const hardR5Pct = ((hardR5 / hardTotal) * 100).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("OVERALL BENCHMARK RESULTS (JavaScript Engine)");
  console.log("=".repeat(60));
  console.log(`  Recall@1:                         ${r1Pct.padStart(5)}%  (${hitsAt1}/${totalQueries})`);
  console.log(`  Recall@3:                         ${r3Pct.padStart(5)}%  (${hitsAt3}/${totalQueries})`);
  console.log(`  Recall@5:                         ${r5Pct.padStart(5)}%  (${hitsAt5}/${totalQueries})`);
  console.log(`  MRR:                              ${mrr.padStart(7)}`);

  console.log("\n" + "=".repeat(60));
  console.log("HARD (ZERO-WORD-OVERLAP) QUERIES");
  console.log("=".repeat(60));
  console.log(`  Recall@1:                         ${hardR1Pct.padStart(5)}%  (${hardR1}/${hardTotal})`);
  console.log(`  Recall@3:                         ${hardR3Pct.padStart(5)}%  (${hardR3}/${hardTotal})`);
  console.log(`  Recall@5:                         ${hardR5Pct.padStart(5)}%  (${hardR5}/${hardTotal})`);

  console.log("\n" + "=".repeat(60));
  console.log("PER-CATEGORY BREAKDOWN");
  console.log("=".repeat(60));
  for (const [cat, data] of Object.entries(byCategory)) {
    const cR1 = ((data.r1 / data.total) * 100).toFixed(1);
    const cR3 = ((data.r3 / data.total) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(12)} R@1=${cR1}%  R@3=${cR3}%  (${data.total} queries)`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Evaluation complete in ${elapsedSec}s ✓`);
  console.log("=".repeat(60) + "\n");
}

main().catch(err => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
