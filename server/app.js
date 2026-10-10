import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authenticate, issueToken, verifyToken } from './auth.js';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STATIC_ROUTES = [
  ['/studio/', join(PROJECT_ROOT, 'apps', 'dialogue-studio')],
  ['/mission/', join(PROJECT_ROOT, 'apps', 'mission-lab')],
  ['/shared/', join(PROJECT_ROOT, 'apps', 'shared')],
];
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

async function readJson(request, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function getBearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || '');
  return match?.[1] || '';
}

async function serveStatic(pathname, response) {
  const route = STATIC_ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  if (!route) return false;
  const [prefix, root] = route;
  const relativePath = pathname.slice(prefix.length) || 'index.html';
  const cleanPath = normalize(relativePath).replace(/^(\.\.(?:[\\/]|$))+/, '');
  const filePath = resolve(root, cleanPath);
  if (!filePath.startsWith(resolve(root))) return false;

  try {
    const fileStat = await stat(filePath);
    const finalPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
    const finalStat = fileStat.isDirectory() ? await stat(finalPath) : fileStat;
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(finalPath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': finalStat.size,
      'Cache-Control': extname(finalPath) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    createReadStream(finalPath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

export function createAppServer({
  tokenSecret,
  aiClient,
  asrClient = null,
  store = null,
  aiConfigured = false,
} = {}) {
  if (!tokenSecret) throw new Error('createAppServer requires tokenSecret');
  if (!aiClient?.chat) throw new Error('createAppServer requires aiClient.chat');

  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'microphone=(self)');
    response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:");

    const url = new URL(request.url || '/', 'http://localhost');
    const { pathname } = url;

    try {
      if (request.method === 'GET' && pathname === '/') {
        response.writeHead(302, { Location: '/studio/' });
        response.end();
        return;
      }

      if (request.method === 'GET' && pathname === '/api/health') {
        sendJson(response, 200, { ok: true, aiConfigured, service: 'hsk-voice-learning' });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/login') {
        const body = await readJson(request);
        const user = store?.authenticate
          ? await store.authenticate(body.username, body.password)
          : authenticate(body.username, body.password);
        await store?.recordLogin?.({
          userId: user?.id,
          username: body.username,
          success: Boolean(user),
          clientApp: body.appId,
          remoteAddress: request.socket.remoteAddress,
        });
        if (!user) {
          sendJson(response, 401, { error: '账号或密码错误' });
          return;
        }
        sendJson(response, 200, { user, token: issueToken(user, tokenSecret) });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/chat') {
        const session = verifyToken(getBearerToken(request), tokenSecret);
        if (!session) {
          sendJson(response, 401, { error: '登录已失效，请重新登录' });
          return;
        }
        const body = await readJson(request);
        if (!Array.isArray(body.messages) || !body.messages.length) {
          sendJson(response, 400, { error: '请先说一句中文' });
          return;
        }
        const reply = await aiClient.chat({
          level: body.level,
          scenario: body.scenario,
          messages: body.messages,
        });
        const userMessage = [...body.messages]
          .reverse()
          .find((message) => message?.role === 'user' && String(message.content || '').trim());
        const persisted = userMessage && store?.saveChatTurn
          ? await store.saveChatTurn({
            conversationId: body.conversationId,
            userId: session.sub,
            clientApp: body.appId,
            level: body.level,
            scenario: body.scenario,
            source: userMessage.source,
            userMessage: String(userMessage.content).trim(),
            assistantMessage: reply,
          })
          : null;
        sendJson(response, 200, {
          reply,
          conversationId: persisted?.conversationId || body.conversationId || null,
        });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/transcribe') {
        const session = verifyToken(getBearerToken(request), tokenSecret);
        if (!session) {
          sendJson(response, 401, { error: '登录已失效，请重新登录' });
          return;
        }
        if (!asrClient?.transcribe) {
          sendJson(response, 503, { error: '语音识别服务尚未配置' });
          return;
        }
        const body = await readJson(request, 14 * 1024 * 1024);
        const audio = String(body.audio ?? '');
        if (!/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/i.test(audio)) {
          sendJson(response, 400, { error: '请提交 WAV 跟读录音' });
          return;
        }
        const base64Length = audio.length - audio.indexOf(',') - 1;
        if (base64Length * 0.75 > 10 * 1024 * 1024) {
          sendJson(response, 413, { error: '跟读录音不能超过 10 MB' });
          return;
        }
        const transcript = await asrClient.transcribe({
          audioDataUri: audio,
          locale: body.locale,
        });
        const persisted = store?.saveTranscription
          ? await store.saveTranscription({
            conversationId: body.conversationId,
            userId: session.sub,
            clientApp: body.appId,
            level: body.level,
            scenario: body.scenario,
            transcript,
            locale: body.locale,
            audioBytes: Math.max(1, Math.floor(base64Length * 0.75)),
          })
          : null;
        sendJson(response, 200, {
          transcript,
          conversationId: persisted?.conversationId || body.conversationId || null,
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/history/latest') {
        const session = verifyToken(getBearerToken(request), tokenSecret);
        if (!session) {
          sendJson(response, 401, { error: '登录已失效，请重新登录' });
          return;
        }
        const history = await store?.getLatestConversation?.({
          userId: session.sub,
          clientApp: url.searchParams.get('appId'),
        });
        sendJson(response, 200, history || { conversationId: null, messages: [] });
        return;
      }

      if (request.method === 'GET' && await serveStatic(pathname, response)) return;
      sendJson(response, 404, { error: '页面或接口不存在' });
    } catch (error) {
      if (error?.message === 'REQUEST_TOO_LARGE') {
        sendJson(response, 413, { error: '请求内容过大' });
        return;
      }
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { error: '请求格式不正确' });
        return;
      }
      const safeMessage = error?.name === 'TimeoutError'
        ? 'AI 响应超时，请稍后重试'
        : String(error?.message || '服务器暂时不可用').replace(/sk-[a-zA-Z0-9]+/g, '[已隐藏]');
      sendJson(response, 502, { error: safeMessage });
    }
  });
}
