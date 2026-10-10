import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../../server/app.js';

async function withServer(run) {
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
        if (username !== 'hskstudent' || password !== 'Hsk@2026') return null;
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
      async getLatestConversation() {
        return null;
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
      body: JSON.stringify({ username: 'hskstudent', password: 'Hsk@2026' }),
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
      body: JSON.stringify({ username: 'hskstudent', password: 'Hsk@2026' }),
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
      body: JSON.stringify({ username: 'hskstudent', password: 'Hsk@2026' }),
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
