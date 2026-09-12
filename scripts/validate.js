/**
 * Dataset & Query Validation Suite (Pure JavaScript)
 * Checks:
 *   ✓ 4,000+ messages
 *   ✓ 8+ participants
 *   ✓ 6+ months date range
 *   ✓ Exactly 40 queries
 *   ✓ 8+ hard queries
 *   ✓ All answer_message_ids exist in messages
 *   ✓ 8/8 hard queries have zero lexical overlap with target answers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const MESSAGES_PATH = path.join(rootDir, 'data', 'messages.json');
const QUERIES_PATH = fs.existsSync(path.join(rootDir, 'data', 'testQueries.json'))
  ? path.join(rootDir, 'data', 'testQueries.json')
  : path.join(rootDir, 'data', 'test_queries.json');

const PASS = "[PASS]";
const FAIL = "[FAIL]";
const errors = [];

function check(condition, label, detail = "") {
  const symbol = condition ? PASS : FAIL;
  const detailStr = detail ? ` — ${detail}` : "";
  console.log(`  ${symbol} ${label}${detailStr}`);
  if (!condition) errors.push(label);
  return condition;
}

function tokenize(text) {
  if (!text) return new Set();
  const words = text.toLowerCase().match(/[a-z]{2,}/g) || [];
  return new Set(words);
}

function main() {
  console.log("\n=== Dataset Validation (JavaScript) ===\n");

  if (!fs.existsSync(MESSAGES_PATH)) {
    console.log(`${FAIL} ${MESSAGES_PATH} not found`);
    process.exit(1);
  }
  if (!fs.existsSync(QUERIES_PATH)) {
    console.log(`${FAIL} ${QUERIES_PATH} not found`);
    process.exit(1);
  }

  const messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf8'));
  const queries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf8'));
  const msgById = new Map(messages.map(m => [m.id, m]));

  // 1. Message Checks
  console.log("Messages:");
  check(messages.length >= 4000, "Messages ≥ 4,000", `${messages.length.toLocaleString()}`);

  const senders = new Set(messages.map(m => m.sender));
  check(senders.size >= 8, "Participants ≥ 8", `${senders.size}: ${[...senders].sort().join(', ')}`);

  const timestamps = messages.map(m => m.timestamp).sort();
  const tStart = new Date(timestamps[0]);
  const tEnd = new Date(timestamps[timestamps.length - 1]);

  const monthsCovered = new Set();
  for (const m of messages) {
    const d = new Date(m.timestamp);
    monthsCovered.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
  }
  const months = monthsCovered.size;
  check(
    months >= 6,
    "Date range ≥ 6 months",
    `${tStart.toISOString().slice(0, 10)} → ${tEnd.toISOString().slice(0, 10)} (${months} months)`
  );

  const convCounts = new Map();
  for (const m of messages) {
    const cid = m.conversation_id || 'general';
    convCounts.set(cid, (convCounts.get(cid) || 0) + 1);
  }
  const longConvs = [...convCounts.entries()].filter(([, count]) => count >= 30).map(([id]) => id);
  check(longConvs.length >= 3, "Long decision threads ≥ 3 (30+ msgs each)", `${longConvs.length}: ${longConvs.join(', ')}`);

  const hasMedia = messages.some(m => ['media', 'system', 'reaction'].includes(m.message_type));
  check(hasMedia, "Media/system/reaction messages present");

  // 2. Query Checks
  console.log("\nQueries:");
  check(queries.length === 40, "Exactly 40 queries", `${queries.length}`);

  const hardQueries = queries.filter(q => q.hard === true);
  check(hardQueries.length >= 8, "Hard queries ≥ 8", `${hardQueries.length}`);

  const missing = queries.filter(q => !msgById.has(q.answer_message_id)).map(q => q.query_id);
  check(missing.length === 0, "All answer_message_ids exist in corpus", missing.length > 0 ? `MISSING: ${missing.join(', ')}` : "all present");

  // 3. Zero-Overlap Verification
  console.log("\nZero-overlap (hard queries):");
  let zeroOverlapOk = 0;
  for (const q of hardQueries) {
    const mid = q.answer_message_id;
    const target = msgById.get(mid);
    if (!target) continue;

    const qTokens = tokenize(q.query);
    const aTokens = tokenize(target.text);
    const overlap = [...qTokens].filter(w => aTokens.has(w));
    const isZero = overlap.length === 0;

    const status = isZero ? PASS : FAIL;
    console.log(`    ${status} [${q.query_id}] "${q.query.slice(0, 52)}${q.query.length > 52 ? '…' : ''}"`);
    if (!isZero) {
      console.log(`         Answer: "${target.text.slice(0, 60)}"`);
      console.log(`         OVERLAP: ${overlap.join(', ')}`);
    } else {
      zeroOverlapOk++;
    }
  }

  check(
    zeroOverlapOk === hardQueries.length,
    "Zero-overlap hard queries verified",
    `${zeroOverlapOk}/${hardQueries.length}`
  );

  // 4. Summary
  console.log("\n" + "=".repeat(40));
  if (errors.length > 0) {
    console.error(`FAILED — ${errors.length} check(s):`);
    for (const e of errors) {
      console.error(`  • ${e}`);
    }
    process.exit(1);
  } else {
    console.log("All checks passed ✓\n");
    console.log(`  Messages : ${messages.length.toLocaleString()}`);
    console.log(`  Senders  : ${senders.size}`);
    console.log(`  Date range: ${tStart.toISOString().slice(0, 10)} → ${tEnd.toISOString().slice(0, 10)}`);
    console.log(`  Queries  : ${queries.length}`);
    console.log(`  Hard     : ${hardQueries.length}`);
    console.log(`  Zero-overlap verified: ${zeroOverlapOk}/${hardQueries.length}`);
  }
}

main();
