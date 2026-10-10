import { randomBytes } from 'node:crypto';

import { createBailianClient } from './ai-client.js';
import { createBailianAsrClient } from './asr-client.js';
import { createAppServer } from './app.js';
import { createDatabasePool, createPostgresStore } from './database.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8866);
const apiKey = process.env.DASHSCOPE_API_KEY || '';
const tokenSecret = process.env.TOKEN_SECRET || randomBytes(32).toString('hex');
const aiClient = createBailianClient({
  apiKey,
  apiUrl: process.env.DASHSCOPE_API_URL,
  model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
});
const asrClient = createBailianAsrClient({
  apiKey,
  apiUrl: process.env.DASHSCOPE_API_URL,
  model: process.env.DASHSCOPE_ASR_MODEL || 'qwen3-asr-flash',
});
const databasePool = createDatabasePool();
const store = databasePool ? createPostgresStore(databasePool) : null;
await store?.ping();
const server = createAppServer({
  tokenSecret,
  aiClient,
  asrClient,
  store,
  aiConfigured: Boolean(apiKey),
});

server.listen(port, host, () => {
  console.log(`HSK Voice Learning: http://${host}:${port}`);
  console.log(`AI configured: ${apiKey ? 'yes' : 'no'}`);
  console.log(`Database configured: ${store ? 'yes' : 'no'}`);
});

function shutdown() {
  server.close(async () => {
    await store?.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
