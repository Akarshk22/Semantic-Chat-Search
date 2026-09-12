import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import searchRouter from './routes/search.js';
import { IndexService } from './services/indexService.js';

const app = express();

app.use(cors());
app.use(express.json());

// Health endpoint
app.get('/health', async (req, res) => {
  const svc = IndexService.get();
  res.json({
    status: 'ok',
    environment: 'node',
    messagesLoaded: svc.messages.length,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel
  });
});

// API routes
app.use('/api', searchRouter);

// Preload index on server startup
const server = app.listen(config.port, config.host, async () => {
  console.log(`\n🚀 Semantic Chat Search Server (Express.js) running at http://${config.host}:${config.port}`);
  try {
    const svc = IndexService.get();
    await svc.load();
    console.log(`✨ Search engine ready for queries.\n`);
  } catch (err) {
    console.error(`⚠️ Error during search engine startup:`, err.message);
  }
});

export default app;
