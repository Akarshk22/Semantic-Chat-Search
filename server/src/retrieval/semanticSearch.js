/**
 * Fast Float32Array Vector Semantic Search Engine in JavaScript.
 * Uses L2-normalized cosine similarity (dot product).
 */

export class SemanticSearchEngine {
  /**
   * @param {Float32Array} embeddings Flat Float32Array of shape (N * D)
   * @param {string[]} messageIds Array of length N
   * @param {number} dimension Vector dimension (e.g. 384)
   */
  constructor(embeddings, messageIds, dimension = 384) {
    this.embeddings = embeddings;
    this.messageIds = messageIds;
    this.dimension = dimension;
    this.N = messageIds.length;
  }

  /**
   * Search query vector against all message embeddings.
   * @param {Float32Array|number[]} queryEmbedding 
   * @param {number} topK 
   * @returns {Array<[string, number]>} List of [messageId, cosineSimilarity]
   */
  search(queryEmbedding, topK = 60) {
    const q = queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding);
    const D = this.dimension;
    const N = this.N;

    // Ensure query is L2-normalized
    let qNorm = 0;
    for (let d = 0; d < D; d++) {
      qNorm += q[d] * q[d];
    }
    qNorm = Math.sqrt(qNorm);
    const invQNorm = qNorm > 0 ? 1 / qNorm : 1;

    // Calculate dot products
    const scores = [];
    for (let i = 0; i < N; i++) {
      const offset = i * D;
      let dot = 0;
      for (let d = 0; d < D; d++) {
        dot += this.embeddings[offset + d] * q[d];
      }
      // Since pre-indexed embeddings are already unit vectors, dot * invQNorm is cosine sim
      scores.push({ id: this.messageIds[i], score: dot * invQNorm });
    }

    // Sort descending
    scores.sort((a, b) => b.score - a.score);

    const results = scores.slice(0, Math.min(topK, N));
    return results.map(r => [r.id, Number(r.score.toFixed(4))]);
  }
}
