import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../../server/app.js';

const TEST_PASSWORD = 'api-test-password-491';

async function withServer(run, { history } = {}) {
  const calls = [];
  const persistenceCalls = [];
  const server = createAppServer({
    tokenSecret: 'api-test-secret',
    aiConfigured: true,
    aiClient: {
      async chat(input) {
        calls.push(input);
        return '很好。你还想点什么？';
      },
    },
    asrClient: {
      async transcribe({ audioDataUri }) {
        assert.match(audioDataUri, /^data:audio\/wav;base64,/);
        return '你好，我在学习中文。';
      },
    },
    store: {
      async authenticate(username, password) {
        persistenceCalls.push(['authenticate', username]);
        if (username !== 'hskstudent' || password !== TEST_PASSWORD) return null;
        return {
          id: 'student-001',
          username: 'hskstudent',
          displayName: '林晓语',
          role: 'student',
        };
      },
      async recordLogin(input) {
        persistenceCalls.push(['recordLogin', input.success]);
      },
      async saveTranscription(input) {
        persistenceCalls.push(['saveTranscription', input.transcript]);
        return { conversationId: '11111111-1111-4111-8111-111111111111' };
      },
      async saveChatTurn(input) {
        persistenceCalls.push(['saveChatTurn', input.userMessage]);
        return { conversationId: '11111111-1111-4111-8111-111111111111' };
      },
      async getLatestConversation(input) {
        persistenceCalls.push(['getLatestConversation', input]);
        return typeof history === 'function' ? history(input) : history ?? null;
      },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, calls, persistenceCalls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('OIDC 登录只接受已验证身份并签发 HSK 本地会话', async () => {
  const oidcInputs = [];
  const server = createAppServer({
    tokenSecret: 'oidc-test-secret',
    aiClient: { async chat() { return '好的。'; } },
    oidcIssuer: 'https://identity.example/realms/front',
    oidcVerifier: async (token) => {
      assert.equal(token, 'verified-access-token');
      return { subject: 'idp-sub-1', username: 'current-user', displayName: '当前用户' };
    },
    store: {
      async authenticateOidc(input) {
        oidcInputs.push(input);
        return { id: 'hsk-user-1', username: input.username, displayName: input.displayName, role: 'student' };
      },
      async recordLogin(input) { oidcInputs.push(input); },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/oidc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken: 'verified-access-token', appId: 'hsk-mobile' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.user.id, 'hsk-user-1');
    assert.equal(body.user.role, 'student');
    assert.equal(typeof body.token, 'string');
    assert.deepEqual(oidcInputs[0], {
      subject: 'idp-sub-1',
      username: 'current-user',
      displayName: '当前用户',
      issuer: 'https://identity.example/realms/front',
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('OIDC 登录拒绝无效令牌且不调用用户存储', async () => {
  let storeCalls = 0;
  const server = createAppServer({
    tokenSecret: 'oidc-invalid-test',
    aiClient: { async chat() { return '好的。'; } },
    oidcVerifier: async () => { throw new Error('invalid'); },
    store: { async authenticateOidc() { storeCalls += 1; } },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/oidc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken: 'forged' }),
    });
    assert.equal(response.status, 401);
    assert.equal(storeCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('健康检查只返回配置状态，不返回密钥', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, aiConfigured: true, service: 'hsk-voice-learning' });
    assert.doesNotMatch(JSON.stringify(body), /secret|key/i);
  });
});

test('登录后才能调用 AI 对话接口', async () => {
  await withServer(async (baseUrl, calls, persistenceCalls) => {
    const denied = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }),
    });
    assert.equal(denied.status, 401);

    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskstudent', password: TEST_PASSWORD }),
    });
    const session = await login.json();
    assert.equal(login.status, 200);
    assert.equal(session.user.displayName, '林晓语');

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        level: 3,
        scenario: '点餐',
        messages: [{ role: 'user', content: '我要面条。' }],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reply, '很好。你还想点什么？');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].scenario, '点餐');
    assert.deepEqual(persistenceCalls.at(-1), ['saveChatTurn', '我要面条。']);
  });
});

test('登录后可以提交 WAV 跟读录音进行联网转写', async () => {
  await withServer(async (baseUrl, _calls, persistenceCalls) => {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskstudent', password: TEST_PASSWORD }),
    });
    const session = await login.json();
    const response = await fetch(`${baseUrl}/api/transcribe`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audio: 'data:audio/wav;base64,UklGRg==', locale: 'zh-CN' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.transcript, '你好，我在学习中文。');
    assert.equal(body.conversationId, '11111111-1111-4111-8111-111111111111');
    assert.deepEqual(persistenceCalls.at(-1), ['saveTranscription', '你好，我在学习中文。']);
  });
});

test('登录后可以恢复最近一次文本会话', async () => {
  const store = {
    async authenticate() {
      return {
        id: 'student-001',
        username: 'hskstudent',
        displayName: '林晓语',
        role: 'student',
      };
    },
    async recordLogin() {},
    async getLatestConversation() {
      return {
        conversationId: '22222222-2222-4222-8222-222222222222',
        messages: [{ role: 'user', content: '上次练习的句子。' }],
      };
    },
  };
  const server = createAppServer({
    tokenSecret: 'history-test-secret',
    aiClient: { async chat() { return '好。'; } },
    store,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const login = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskstudent', password: TEST_PASSWORD }),
    });
    const session = await login.json();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/history/latest?appId=com.hskvoice.hsk_dialogue_studio`,
      { headers: { authorization: `Bearer ${session.token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.conversationId, '22222222-2222-4222-8222-222222222222');
    assert.equal(body.messages[0].content, '上次练习的句子。');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('会话历史按游标稳定分页并绑定用户和应用', async () => {
  const historyCalls = [];
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const historyCursor = {
    conversationId,
    id: '100',
    createdAt: '2026-10-11T02:00:00.123456Z',
  };
  await withServer(async (baseUrl, _calls, persistenceCalls) => {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskstudent', password: TEST_PASSWORD }),
    });
    const session = await login.json();
    const firstUrl = new URL('/api/history/latest', baseUrl);
    firstUrl.search = new URLSearchParams({
      appId: 'com.hskvoice.hsk_dialogue_studio',
      limit: '2',
    }).toString();
    const firstResponse = await fetch(firstUrl, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    const firstPage = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(firstPage.messages.map((message) => message.content), ['第 1 页']);
    assert.equal(firstPage.hasMore, true);
    assert.deepEqual(firstPage.nextCursor, historyCursor);

    const nextUrl = new URL('/api/history/latest', baseUrl);
    nextUrl.search = new URLSearchParams({
      appId: 'com.hskvoice.hsk_dialogue_studio',
      limit: '2',
      cursorConversationId: historyCursor.conversationId,
      cursorId: historyCursor.id,
      cursorCreatedAt: historyCursor.createdAt,
    }).toString();
    const nextResponse = await fetch(nextUrl, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    const nextPage = await nextResponse.json();
    assert.equal(nextResponse.status, 200);
    assert.deepEqual(nextPage.messages.map((message) => message.content), ['更早的消息']);
    assert.equal(nextPage.hasMore, false);
    assert.equal(nextPage.nextCursor, null);

    const historyInputs = persistenceCalls
      .filter(([name]) => name === 'getLatestConversation')
      .map(([, input]) => input);
    assert.deepEqual(historyInputs, [
      {
        userId: 'student-001',
        clientApp: 'com.hskvoice.hsk_dialogue_studio',
        limit: 2,
        cursor: null,
      },
      {
        userId: 'student-001',
        clientApp: 'com.hskvoice.hsk_dialogue_studio',
        limit: 2,
        cursor: historyCursor,
      },
    ]);
  }, {
    history(input) {
      historyCalls.push(input);
      return input.cursor
        ? {
            conversationId,
            messages: [{ role: 'user', content: '更早的消息' }],
            hasMore: false,
            nextCursor: null,
          }
        : {
            conversationId,
            messages: [{ role: 'user', content: '第 1 页' }],
            hasMore: true,
            nextCursor: historyCursor,
          };
    },
  });
  assert.equal(historyCalls.length, 2);
});

test('拒绝不完整游标和超过最大限制的历史查询', async () => {
  await withServer(async (baseUrl) => {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskstudent', password: TEST_PASSWORD }),
    });
    const session = await login.json();
    for (const query of ['cursorId=1', 'limit=101']) {
      const response = await fetch(`${baseUrl}/api/history/latest?${query}`, {
        headers: { authorization: `Bearer ${session.token}` },
      });
      assert.equal(response.status, 400);
    }
    const oversizedId = await fetch(
      `${baseUrl}/api/history/latest?cursorConversationId=22222222-2222-4222-8222-222222222222&cursorId=9223372036854775808&cursorCreatedAt=2026-10-11T02%3A00%3A00.123456Z`,
      { headers: { authorization: `Bearer ${session.token}` } },
    );
    assert.equal(oversizedId.status, 400);
  });
});
