/**
 * Index and Retrieval Service: Singleton managing embedding search, BM25, and reranking.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { loadMessages } from './dataLoader.js';
import { SemanticSearchEngine } from '../retrieval/semanticSearch.js';
import { LexicalSearchEngine } from '../retrieval/lexicalSearch.js';
import { ContextExpander } from '../retrieval/context.js';
import { Reranker } from '../retrieval/reranker.js';

let instance = null;

export class IndexService {
  constructor() {
    this.messages = [];
    this.messagesById = new Map();
    this.semantic = null;
    this.lexical = null;
    this.context = null;
    this.reranker = null;
    this.isLoaded = false;
    this.pipeline = null;
    this.queryEmbeddingsCache = new Map();
  }

  static get() {
    if (!instance) {
      instance = new IndexService();
    }
    return instance;
  }

  async load() {
    if (this.isLoaded) return;

    console.log('[IndexService] Initializing search engine...');

    // 1. Load Messages
    this.messages = loadMessages(config.messagesPath);
    for (const m of this.messages) {
      this.messagesById.set(m.id, m);
    }
    console.log(`[IndexService] Loaded ${this.messages.length} messages.`);

    // 2. Load Embeddings (prefer fast binary .bin, fallback to .npy)
    let rawFloats = null;
    let meta = null;

    if (fs.existsSync(config.metaPath)) {
      meta = JSON.parse(fs.readFileSync(config.metaPath, 'utf8'));
    } else {
      throw new Error(`Metadata file not found at ${config.metaPath}. Run "npm run build-index" first.`);
    }

    const messageIds = meta.message_ids || meta.messageIds;

    if (fs.existsSync(config.embeddingsBinPath)) {
      const buf = fs.readFileSync(config.embeddingsBinPath);
      rawFloats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    } else if (fs.existsSync(config.embeddingsNpyPath)) {
      const buf = fs.readFileSync(config.embeddingsNpyPath);
      const headerLen = buf.readUInt16LE(8);
      const dataOffset = 10 + headerLen;
      rawFloats = new Float32Array(buf.buffer, buf.byteOffset + dataOffset, messageIds.length * 384);
    } else {
      throw new Error(`Embeddings file not found. Run "npm run build-index" first.`);
    }

    console.log(`[IndexService] Loaded vector matrix with ${messageIds.length} embeddings.`);
    this.semantic = new SemanticSearchEngine(rawFloats, messageIds, 384);

    // 3. Initialize BM25 Lexical Engine (excluding system events and reactions)
    const documents = messageIds.map(id => {
      const msg = this.messagesById.get(id);
      if (!msg || msg.message_type === 'system' || msg.message_type === 'reaction') {
        return '';
      }
      if (msg.text.includes('left the group') || msg.text.includes('joined the group')) {
        return '';
      }
      return msg.text;
    });
    this.lexical = new LexicalSearchEngine(documents, messageIds);
    console.log('[IndexService] BM25 inverted index initialized.');

    // 4. Context Expander & Reranker
    this.context = new ContextExpander(this.messages);
    this.reranker = new Reranker(config);

    // 5. Load pre-cached query embeddings if available
    const cachePath = path.join(config.indexDir, 'queryEmbeddings.json');
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        for (const [q, emb] of Object.entries(cached)) {
          this.queryEmbeddingsCache.set(q.toLowerCase().trim(), new Float32Array(emb));
        }
        console.log(`[IndexService] Loaded ${this.queryEmbeddingsCache.size} precomputed query vectors.`);
      } catch (e) {
        console.warn('[IndexService] Could not parse query cache:', e.message);
      }
    }

    this.isLoaded = true;
    console.log('[IndexService] Search engine ready.');
  }

  /**
   * Embed a single query string into a 384-d vector.
   * @param {string} query 
   * @returns {Promise<Float32Array>}
   */
  async embedQuery(query) {
    const normQ = query.toLowerCase().trim();

    // Check precomputed / memory cache first
    if (this.queryEmbeddingsCache.has(normQ)) {
      return this.queryEmbeddingsCache.get(normQ);
    }

    // Provider: OpenAI
    if (config.embeddingProvider === 'openai' && config.apiKey) {
      return this._embedOpenAI(query);
    }

    // Provider: Gemini
    if (config.embeddingProvider === 'gemini' && config.apiKey) {
      return this._embedGemini(query);
    }

    // Provider: Local Transformers.js
    return this._embedTransformersLocal(query);
  }

  async _embedTransformersLocal(text) {
    if (!this.pipeline) {
      console.log('[IndexService] Loading local HuggingFace Transformers.js pipeline...');
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
      console.log('[IndexService] Local transformer pipeline loaded.');
    }

    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    const vec = new Float32Array(output.data);
    this.queryEmbeddingsCache.set(text.toLowerCase().trim(), vec);
    return vec;
  }

  async _embedOpenAI(text) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: config.embeddingModel || 'text-embedding-3-small'
      })
    });
    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.statusText}`);
    const data = await res.json();
    const vec = new Float32Array(data.data[0].embedding);
    this.queryEmbeddingsCache.set(text.toLowerCase().trim(), vec);
    return vec;
  }

  async _embedGemini(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] }
      })
    });
    if (!res.ok) throw new Error(`Gemini embedding failed: ${res.statusText}`);
    const data = await res.json();
    const vec = new Float32Array(data.embedding.values);
    this.queryEmbeddingsCache.set(text.toLowerCase().trim(), vec);
    return vec;
  }
}
