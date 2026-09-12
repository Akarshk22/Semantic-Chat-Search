/**
 * Pure JavaScript BM25 Lexical Search Engine with Hinglish-aware tokenization.
 */

const HINGLISH_STOPWORDS = new Set([
  // English grammatical
  "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with",
  "is", "was", "are", "were", "it", "this", "that", "of", "by", "as",
  // Conversational meta-words (avoid matching system events and boilerplate)
  "group", "chat", "channel", "message", "messages", "conversation", "thread",
  "talk", "talking", "discuss", "discussed", "discussing", "say", "said",
  // Romanized Hindi / Hinglish stopwords
  "hai", "hain", "ko", "se", "ke", "ka", "ki", "aur", "bhi", "toh",
  "karo", "kare", "karna", "tha", "thi", "the", "ho", "me", "mein",
  "ye", "yeh", "wo", "woh", "ab", "kya", "kyun", "kyu", "bhai", "yaar"
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.filter(w => w.length >= 2 && !HINGLISH_STOPWORDS.has(w));
}

export class LexicalSearchEngine {
  /**
   * @param {string[]} documents Array of text documents
   * @param {string[]} docIds Aligned document IDs
   * @param {number} k1 Term frequency saturation parameter (default 1.5)
   * @param {number} b Document length penalization parameter (default 0.75)
   */
  constructor(documents, docIds, k1 = 1.5, b = 0.75) {
    this.docIds = docIds;
    this.k1 = k1;
    this.b = b;
    this.N = documents.length;

    this.docLengths = new Float32Array(this.N);
    this.docTokens = [];
    this.invertedIndex = new Map(); // term -> Map<docIdx, termFreq>
    let totalLength = 0;

    for (let i = 0; i < this.N; i++) {
      const tokens = tokenize(documents[i]);
      this.docTokens.push(tokens);
      const len = tokens.length;
      this.docLengths[i] = len;
      totalLength += len;

      const termFreq = new Map();
      for (const t of tokens) {
        termFreq.set(t, (termFreq.get(t) || 0) + 1);
      }

      for (const [t, count] of termFreq.entries()) {
        let posting = this.invertedIndex.get(t);
        if (!posting) {
          posting = new Map();
          this.invertedIndex.set(t, posting);
        }
        posting.set(i, count);
      }
    }

    this.avgdl = this.N > 0 ? totalLength / this.N : 1;

    // Precompute IDF for all terms in index
    this.idf = new Map();
    for (const [term, posting] of this.invertedIndex.entries()) {
      const df = posting.size;
      // Lucene / standard Okapi IDF formula: ln(1 + (N - df + 0.5) / (df + 0.5))
      const idfVal = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
      this.idf.set(term, Math.max(0, idfVal));
    }
  }

  /**
   * Search query against corpus using BM25.
   * @param {string} query 
   * @param {number} topK 
   * @returns {Array<[string, number]>} List of [docId, normalizedScore]
   */
  search(query, topK = 50) {
    const qTokens = tokenize(query);
    if (qTokens.length === 0 || this.N === 0) return [];

    const scores = new Float32Array(this.N);

    for (const token of qTokens) {
      const posting = this.invertedIndex.get(token);
      if (!posting) continue;

      const idf = this.idf.get(token) || 0;

      for (const [docIdx, tf] of posting.entries()) {
        const docLen = this.docLengths[docIdx];
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgdl));
        scores[docIdx] += idf * (numerator / denominator);
      }
    }

    // Collect non-zero scores
    const results = [];
    let maxScore = 0;
    for (let i = 0; i < this.N; i++) {
      const s = scores[i];
      if (s > 0) {
        results.push({ id: this.docIds[i], score: s });
        if (s > maxScore) maxScore = s;
      }
    }

    // Sort descending
    results.sort((a, b) => b.score - a.score);

    // Normalize top-K scores to [0, 1]
    const topResults = results.slice(0, topK);
    const normFactor = maxScore > 0 ? maxScore : 1;

    return topResults.map(r => [r.id, Number((r.score / normFactor).toFixed(4))]);
  }
}
