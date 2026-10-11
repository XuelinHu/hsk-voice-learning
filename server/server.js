import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createBailianClient } from './ai-client.js';
import { createBailianAsrClient } from './asr-client.js';
import { createAppServer } from './app.js';
import { createDatabasePool, createPostgresStore } from './database.js';
import { createWebServer } from './web-server.js';
import { createOidcVerifier } from './oidc.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8040);
const webPort = Number(process.env.WEB_PORT || 4035);
const tlsKeyPath = process.env.TLS_KEY_PATH || '';
const tlsCertPath = process.env.TLS_CERT_PATH || '';
if (Boolean(tlsKeyPath) !== Boolean(tlsCertPath)) {
  throw new Error('TLS_KEY_PATH and TLS_CERT_PATH must be configured together');
}
const tlsOptions = tlsKeyPath
  ? { key: await readFile(tlsKeyPath), cert: await readFile(tlsCertPath) }
  : null;
const aiApiKey = process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const aiApiUrl = process.env.AI_BASE_URL || process.env.DASHSCOPE_API_URL;
const aiModel = process.env.AI_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-plus';
const aiProviderName = process.env.AI_BASE_URL ? '局域网 AI' : '百炼';
const tokenSecret = process.env.TOKEN_SECRET || randomBytes(32).toString('hex');
const aiClient = createBailianClient({
  apiKey: aiApiKey,
  apiUrl: aiApiUrl,
  model: aiModel,
  providerName: aiProviderName,
});
const asrClient = createBailianAsrClient({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  apiUrl: process.env.DASHSCOPE_API_URL,
  model: process.env.DASHSCOPE_ASR_MODEL || 'qwen3-asr-flash',
});
const databasePool = createDatabasePool();
const store = databasePool ? createPostgresStore(databasePool) : null;
await store?.ping();
const oidcIssuer = (process.env.OIDC_ISSUER || '').replace(/\/$/, '');
const oidcVerifier = createOidcVerifier({
  issuer: oidcIssuer,
  clientIds: (process.env.OIDC_CLIENT_IDS || '').split(',').map((value) => value.trim()).filter(Boolean),
});
const server = createAppServer({
  tokenSecret,
  aiClient,
  asrClient,
  store,
  aiConfigured: Boolean(aiApiKey),
  oidcVerifier,
  oidcIssuer,
  tlsOptions,
});

const webServer = createWebServer(port, {
  tlsOptions,
  apiTls: Boolean(tlsOptions),
  apiHost: process.env.WEB_API_HOST || '127.0.0.1',
});
for (const listener of [server, webServer]) {
  listener.on('error', (error) => {
    console.error(`HSK 服务启动失败：${error.code}`);
    process.exit(1);
  });
}
server.listen(port, host, () => {
  console.log(`HSK API: ${tlsOptions ? 'https' : 'http'}://${host}:${port}`);
  console.log(`AI configured: ${aiApiKey ? 'yes' : 'no'}`);
  console.log(`Database configured: ${store ? 'yes' : 'no'}`);
});
webServer.listen(webPort, host, () => {
  console.log(`HSK Voice Learning: ${tlsOptions ? 'https' : 'http'}://${host}:${webPort}`);
});

function shutdown() {
  webServer.close();
  server.close(async () => {
    await store?.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
