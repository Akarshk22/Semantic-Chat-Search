import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '127.0.0.1',
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
  embeddingModel: process.env.EMBEDDING_MODEL || 'paraphrase-multilingual-MiniLM-L12-v2',
  apiKey: process.env.API_KEY || '',
  
  // Retrieval weights
  weightSemantic: parseFloat(process.env.WEIGHT_SEMANTIC || '0.55'),
  weightLexical: parseFloat(process.env.WEIGHT_LEXICAL || '0.15'),
  weightPerson: parseFloat(process.env.WEIGHT_PERSON || '0.10'),
  weightTemporal: parseFloat(process.env.WEIGHT_TEMPORAL || '0.10'),
  weightDecision: parseFloat(process.env.WEIGHT_DECISION || '0.10'),
  
  contextWindow: parseInt(process.env.CONTEXT_WINDOW || '3', 10),
  referenceDate: new Date(process.env.REFERENCE_DATE || '2026-09-12T00:00:00'),
  
  // File paths
  messagesPath: path.join(rootDir, 'data', 'messages.json'),
  queriesPath: path.join(rootDir, 'data', 'testQueries.json'),
  indexDir: path.join(rootDir, 'data', 'index'),
  embeddingsBinPath: path.join(rootDir, 'data', 'index', 'embeddings.bin'),
  embeddingsNpyPath: path.join(rootDir, 'data', 'index', 'embeddings.npy'),
  metaPath: path.join(rootDir, 'data', 'index', 'meta.json')
};
