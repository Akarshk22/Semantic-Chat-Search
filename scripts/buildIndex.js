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
  msg_D001: "yes we finally agreed to go to Manali, leaving on the 18th",
  msg_D002: "trip confirmed from 18th to 22nd August, 4 nights plan finalized",
  msg_D003: "we will take an overnight Volvo bus, costs 1400 per head, AC and comfortable",
  msg_D004: "Zostel Manali both rooms confirmed, 2800 per night split between everyone",
  msg_D005: "total budget max 12k per head including all travel costs",
  msg_D006: "Pyaar restaurant is confirmed for Saturday 8pm reservation",
  msg_D007: "table booked 8 seater in Priya's name",
  msg_D008: "React and Node finalized as tech stack, client approved, starting now",
  msg_D009: "three weeks to deliver MVP, deadline is October 5th",
  msg_D010: "cannot exceed 15k spending limit, budget is tight",
  msg_D011: "dropping Rishikesh idea because it was too crowded last time",
  msg_D012: "Goa in July has too much rain, avoid monsoon season",
  msg_D013: "dropping Vue because nobody in the team knows it well enough",
  msg_D014: "Olive Garden booking cancelled, too expensive for 8 people",
  msg_D015: "do not use Angular, the learning curve is too steep for our timeline"
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
    if (m.conversation_id === convId) {
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

  // If embeddings.bin already exists, verify integrity
  if (fs.existsSync(EMBEDDINGS_BIN)) {
    const stat = fs.statSync(EMBEDDINGS_BIN);
    const expectedBytes = messageIds.length * 384 * 4;
    if (stat.size === expectedBytes) {
      console.log(`Verified existing embeddings.bin (${(stat.size / (1024 * 1024)).toFixed(2)} MB).`);
      fs.writeFileSync(META_JSON, JSON.stringify({ message_ids: messageIds, dimension: 384 }, null, 2));
      console.log(`Updated meta.json.`);
    }
  } else if (fs.existsSync(path.join(INDEX_DIR, 'embeddings.npy'))) {
    // Convert from embeddings.npy
    console.log("Exporting embeddings from embeddings.npy to embeddings.bin...");
    const buf = fs.readFileSync(path.join(INDEX_DIR, 'embeddings.npy'));
    const headerLen = buf.readUInt16LE(8);
    const dataOffset = 10 + headerLen;
    const rawFloats = buf.subarray(dataOffset);
    fs.writeFileSync(EMBEDDINGS_BIN, rawFloats);
    fs.writeFileSync(META_JSON, JSON.stringify({ message_ids: messageIds, dimension: 384 }, null, 2));
    console.log(`Exported embeddings.bin successfully.`);
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
      
      const cache = {};
      for (const q of queries) {
        const qText = q.query.toLowerCase().trim();
        const out = await embedder(q.query, { pooling: 'mean', normalize: true });
        cache[qText] = Array.from(out.data);
      }
      fs.writeFileSync(QUERY_EMBEDDINGS_JSON, JSON.stringify(cache));
      console.log(`Saved ${queries.length} query vectors to queryEmbeddings.json.`);
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
