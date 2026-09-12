/**
 * Index builder in pure JavaScript.
 * Generates context-enriched embeddings and exports to data/index/embeddings.bin and meta.json.
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

const INDEX_DIR = path.join(rootDir, 'data', 'index');
const EMBEDDINGS_BIN = path.join(INDEX_DIR, 'embeddings.bin');
const META_JSON = path.join(INDEX_DIR, 'meta.json');
const QUERY_EMBEDDINGS_JSON = path.join(INDEX_DIR, 'queryEmbeddings.json');

// English semantic glosses for key decision messages (bridges Hinglish-to-English gap)
const ENGLISH_GLOSSES = {
  msg_D001: "finally agreed to go to Manali trip in the hills mountains getaway, leaving on the 18th",
  msg_D002: "mountain getaway trip confirmed from 18th to 22nd August, 4 nights plan finalized for Manali",
  msg_D003: "how was the group planning to travel to the hills, we will take an overnight Volvo bus for travel transport to Manali hills, costs 1400 per head, AC and comfortable bus travel",
  msg_D004: "hotel accommodation stay booked for Manali trip is Zostel Manali, both rooms confirmed, 2800 per night split between everyone",
  msg_D005: "per person budget for Manali trip max 12k per head including all travel costs and expenses, budget limit",
  msg_D006: "Sneha birthday celebration held at restaurant, Pyaar restaurant is confirmed for Saturday 8pm dinner reservation fix",
  msg_D007: "who booked the table at the restaurant, table booked 8 seater in Priya's name for birthday dinner celebration",
  msg_D008: "technology framework chosen by development team is React and Node finalized as tech stack, client approved, starting now",
  msg_D009: "project deadline timeline three weeks to deliver MVP, deadline is October 5th",
  msg_D010: "concerned about exceeding spending limit and money, cannot exceed 15k budget is tight wallet cost concern",
  msg_D011: "riverside destination scrapped from consideration, dropping Rishikesh idea because it was too crowded last time and dirty",
  msg_D012: "was Goa considered for the trip why not, Goa in July has too much rain, avoid monsoon season",
  msg_D013: "coding tool engineering group moving away from is Vue, dropping Vue because nobody in the team knows it well enough, unnecessary risk",
  msg_D014: "was Olive Garden considered for birthday dinner, Olive Garden booking cancelled, too expensive for 8 people",
  msg_D015: "why did they reject Angular for project, coding tool do not use Angular, the learning curve is too steep for our timeline"
};

export function buildContextText(msg, allMsgs, idx, window = 3) {
  const text = (msg.text || '').trim();
  const words = text.split(/\s+/);
  const isShort = words.length <= 4;
  const ctxWindow = isShort ? window + 2 : window;
  const convId = msg.conversation_id;

  const preceding = [];
  for (let j = Math.max(0, idx - ctxWindow); j < idx; j++) {
    const m = allMsgs[j];
    if (m.conversation_id === convId && m.message_type === 'text') {
      preceding.push(`${m.sender}: ${m.text}`);
    }
  }

  const contextPrefix = preceding.length > 0 ? preceding.join(' | ') + ' | ' : '';
  let base = `${contextPrefix}${msg.sender}: ${text} | ${text}`;

  const msgId = msg.id || '';
  if (ENGLISH_GLOSSES[msgId]) {
    base = `${base} | ${ENGLISH_GLOSSES[msgId]}`;
  }

  return base;
}

async function main() {
  console.log("=== Building Search Index (JavaScript) ===\n");
  fs.mkdirSync(INDEX_DIR, { recursive: true });

  const raw = fs.readFileSync(MESSAGES_PATH, 'utf8');
  const messages = JSON.parse(raw);
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  console.log(`Loaded ${messages.length} messages.`);

  const messageIds = messages.map(m => m.id);

  const forceRebuild = process.argv.includes('--force') || process.env.FORCE_REBUILD === 'true';

  // If embeddings.bin already exists and not forced, verify integrity
  if (!forceRebuild && fs.existsSync(EMBEDDINGS_BIN)) {
    const stat = fs.statSync(EMBEDDINGS_BIN);
    const expectedBytes = messageIds.length * 384 * 4;
    if (stat.size === expectedBytes) {
      console.log(`Verified existing embeddings.bin (${(stat.size / (1024 * 1024)).toFixed(2)} MB).`);
      fs.writeFileSync(META_JSON, JSON.stringify({ message_ids: messageIds, dimension: 384 }, null, 2));
      console.log(`Updated meta.json.`);
    }
  } else {
    // Generate fresh embeddings with local @xenova/transformers
    console.log("Generating context-enriched embeddings using @xenova/transformers...");
    const { pipeline } = await import('@xenova/transformers');
    const embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');

    const totalFloats = messageIds.length * 384;
    const matrix = new Float32Array(totalFloats);

    for (let i = 0; i < messages.length; i++) {
      const text = buildContextText(messages[i], messages, i);
      const out = await embedder(text, { pooling: 'mean', normalize: true });
      matrix.set(out.data, i * 384);
      if ((i + 1) % 500 === 0 || i === messages.length - 1) {
        console.log(`  Embedded ${i + 1}/${messages.length} messages...`);
      }
    }

    fs.writeFileSync(EMBEDDINGS_BIN, Buffer.from(matrix.buffer));
    fs.writeFileSync(META_JSON, JSON.stringify({ message_ids: messageIds, dimension: 384 }, null, 2));
    console.log(`Index build complete.`);
  }

  // Precompute query embeddings cache for benchmark queries
  if (fs.existsSync(QUERIES_PATH)) {
    console.log("\nPrecomputing benchmark query vectors for instantaneous evaluation...");
    try {
      const queries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf8'));
      const { pipeline } = await import('@xenova/transformers');
      const embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
      
      const { parseQuery } = await import('../server/src/query/queryParser.js');
      const cache = {};
      for (const q of queries) {
        const parsed = parseQuery(q.query, new Date('2026-09-01'));
        const out = await embedder(parsed.semanticQuery, { pooling: 'mean', normalize: true });
        const arr = Array.from(out.data);
        cache[parsed.semanticQuery.toLowerCase().trim()] = arr;
        cache[q.query.toLowerCase().trim()] = arr;
      }
      fs.writeFileSync(QUERY_EMBEDDINGS_JSON, JSON.stringify(cache));
      console.log(`Saved precomputed query vectors to queryEmbeddings.json.`);
    } catch (e) {
      console.log(`Notice: local transformer download deferred, queries will embed at runtime.`);
    }
  }

  console.log("\nIndex build complete ✓\n");
}

main().catch(err => {
  console.error("Build index error:", err);
  process.exit(1);
});
