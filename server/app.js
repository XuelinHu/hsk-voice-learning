import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { issueToken, verifyToken } from './auth.js';
import { ALL_DEMO_ACCOUNTS } from './demo-accounts.js';
import { BUILT_IN_QUESTIONS, PRACTICE_SOURCES } from './practice-content.js';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STATIC_ROUTES = [
  ['/platform/', join(PROJECT_ROOT, 'apps', 'platform')],
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

// Local demo identities keep the APK and browser smoke flows usable before a
// PostgreSQL instance is provisioned. They are intentionally only active when
// no database store is configured.
const DEMO_IDENTITIES = new Map(ALL_DEMO_ACCOUNTS.map((account) => [account.username, account]));

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
  oidcVerifier = null,
  oidcIssuer = '',
  tlsOptions = null,
  allowDemoLogin = process.env.NODE_ENV !== 'production',
} = {}) {
  if (!tokenSecret) throw new Error('createAppServer requires tokenSecret');
  if (!aiClient?.chat) throw new Error('createAppServer requires aiClient.chat');

  const memoryQuestions = [];
  const memoryAttempts = new Map();
  const handler = async (request, response) => {
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

      if (pathname.startsWith('/api/practice/') || pathname === '/api/admin/questions') {
        const session = verifyToken(getBearerToken(request), tokenSecret);
        if (!session) {
          sendJson(response, 401, { error: '登录已失效，请重新登录' });
          return;
        }

        if (request.method === 'GET' && pathname === '/api/practice/questions') {
          const level = Number(url.searchParams.get('level'));
          const section = url.searchParams.get('section');
          if (!Number.isInteger(level) || level < 1 || level > 6 || !['listening', 'reading', 'speaking'].includes(section)) {
            sendJson(response, 400, { error: '题目等级或专项无效' });
            return;
          }
          const published = store?.listPracticeQuestions
            ? await store.listPracticeQuestions({ level, section })
            : memoryQuestions.filter((item) => item.level === level && item.section === section);
          sendJson(response, 200, {
            questions: [...BUILT_IN_QUESTIONS.filter((item) => item.level === level && item.section === section), ...published]
              .map(({ answer: _answer, ...question }) => question),
            sources: PRACTICE_SOURCES,
          });
          return;
        }

        if (request.method === 'POST' && pathname === '/api/admin/questions') {
          if (session.role !== 'teacher') {
            sendJson(response, 403, { error: '仅管理员可以发布题目' });
            return;
          }
          const body = await readJson(request);
          const level = Number(body.level);
          const options = Array.isArray(body.options) ? body.options.map((option) => String(option).trim()) : [];
          const answer = Number(body.answer);
          const question = String(body.question || '').trim();
          const section = String(body.section || '');
          if (!Number.isInteger(level) || level < 1 || level > 6
            || !['listening', 'reading', 'speaking'].includes(section)
            || question.length < 4 || question.length > 4000
            || options.length < 2 || options.length > 6
            || options.some((option) => !option || option.length > 500)
            || !Number.isInteger(answer) || answer < 1 || answer > options.length) {
            sendJson(response, 400, { error: '题目内容、选项或答案格式无效' });
            return;
          }
          const input = {
            level, section, question, options, answer,
            explanation: String(body.explanation || '').slice(0, 2000),
            audioText: String(body.audioText || '').slice(0, 4000),
            source: String(body.source || '管理员发布').slice(0, 300),
            createdBy: session.sub,
          };
          const published = store?.createPracticeQuestion
            ? await store.createPracticeQuestion(input)
            : { ...input, id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
          if (!store?.createPracticeQuestion) memoryQuestions.push(published);
          sendJson(response, 201, { question: published });
          return;
        }

        if (request.method === 'POST' && pathname === '/api/practice/attempts') {
          const body = await readJson(request);
          const level = Number(body.level);
          const answer = Number(body.answer);
          const section = String(body.section || '');
          const published = store?.listPracticeQuestions
            ? await store.listPracticeQuestions({ level, section })
            : memoryQuestions.filter((item) => item.level === level && item.section === section);
          const available = [...BUILT_IN_QUESTIONS, ...published];
          const question = available.find((item) => item.id === body.questionId && item.level === level && item.section === section);
          if (!question || !Number.isInteger(answer) || answer < 1 || answer > question.options.length) {
            sendJson(response, 400, { error: '题目或答案无效' });
            return;
          }
          const correct = answer === question.answer;
          const attempt = store?.savePracticeAttempt
            ? await store.savePracticeAttempt({ userId: session.sub, questionId: question.id, level, section, correct })
            : { correct };
          if (!store?.savePracticeAttempt) {
            const attempts = memoryAttempts.get(session.sub) || [];
            attempts.push({ section, correct });
            memoryAttempts.set(session.sub, attempts);
          }
          sendJson(response, 200, {
            correct,
            correctAnswer: correct ? null : question.answer,
            explanation: question.explanation,
            attempt,
          });
          return;
        }

        if (request.method === 'GET' && pathname === '/api/practice/stats') {
          const attempts = memoryAttempts.get(session.sub) || [];
          const stats = store?.getPracticeStats
            ? await store.getPracticeStats(session.sub)
            : {
                total: attempts.length,
                correct: attempts.filter((item) => item.correct).length,
                bySection: Object.fromEntries(['listening', 'reading', 'speaking'].map((section) => {
                  const sectionAttempts = attempts.filter((item) => item.section === section);
                  return [section, {
                    total: sectionAttempts.length,
                    correct: sectionAttempts.filter((item) => item.correct).length,
                    rate: sectionAttempts.length
                      ? Math.round(sectionAttempts.filter((item) => item.correct).length / sectionAttempts.length * 100)
                      : 0,
                  }];
                })),
              };
          sendJson(response, 200, { ...stats, sources: PRACTICE_SOURCES });
          return;
        }
      }

      if (request.method === 'POST' && pathname === '/api/login') {
        const body = await readJson(request);
        const normalizedUsername = String(body.username || '').trim().toLowerCase();
        const demo = allowDemoLogin ? DEMO_IDENTITIES.get(normalizedUsername) : null;
        const authenticated = await store?.authenticate?.(body.username, body.password);
        const user = authenticated || allowDemoLogin
          ? authenticated || (demo && String(body.password || '') === demo.password
            ? (({ password: _password, ...identity }) => identity)(demo)
            : null)
          : null;
        await store?.recordLogin?.({
          userId: authenticated?.id,
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

      if (request.method === 'POST' && pathname === '/api/auth/oidc') {
        if (!oidcVerifier || !store?.authenticateOidc) {
          sendJson(response, 503, { error: '统一登录尚未配置' });
          return;
        }
        const body = await readJson(request);
        let identity;
        try {
          identity = await oidcVerifier(String(body.accessToken || ''));
        } catch {
          sendJson(response, 401, { error: '统一登录令牌无效或已过期' });
          return;
        }
        const user = await store.authenticateOidc({ ...identity, issuer: oidcIssuer });
        if (user?.conflict) {
          sendJson(response, 409, { error: '该用户名已存在，请先完成管理员身份绑定' });
          return;
        }
        if (!user) {
          sendJson(response, 403, { error: '该统一身份未关联有效用户' });
          return;
        }
        await store.recordLogin?.({
          userId: user.id,
          username: user.username,
          success: true,
          clientApp: body.appId,
          remoteAddress: request.socket.remoteAddress,
        });
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
        const persisted = userMessage && !String(session.sub).startsWith('demo-') && store?.saveChatTurn
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
        const persisted = !String(session.sub).startsWith('demo-') && store?.saveTranscription
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
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit == null ? 80 : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          sendJson(response, 400, { error: '历史分页大小无效。' });
          return;
        }
        const cursorParts = [
          url.searchParams.get('cursorConversationId'),
          url.searchParams.get('cursorId'),
          url.searchParams.get('cursorCreatedAt'),
        ];
        const hasCursorPart = cursorParts.some((value) => value != null);
        const [conversationId, id, createdAt] = cursorParts;
        const validCursor = !hasCursorPart || (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId || '')
          && /^[1-9]\d{0,18}$/.test(id || '')
          && BigInt(id) <= 9223372036854775807n
          && Number.isFinite(Date.parse(createdAt || ''))
        );
        if (!validCursor) {
          sendJson(response, 400, { error: '历史分页游标无效。' });
          return;
        }
        const history = await store?.getLatestConversation?.({
          userId: session.sub,
          clientApp: url.searchParams.get('appId'),
          limit,
          cursor: hasCursorPart ? { conversationId, id, createdAt } : null,
        });
        sendJson(response, 200, history || {
          conversationId: null,
          messages: [],
          hasMore: false,
          nextCursor: null,
        });
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
  };
  return tlsOptions ? createSecureServer(tlsOptions, handler) : createServer(handler);
}
