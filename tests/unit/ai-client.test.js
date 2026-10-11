import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMessages, createBailianClient } from '../../server/ai-client.js';

test('HSK 教练提示词包含等级、场景与纠错约束', () => {
  const messages = buildMessages({
    level: 4,
    scenario: '在餐厅点餐',
    messages: [{ role: 'user', content: '我要一个面条。' }],
  });

  assert.match(messages[0].content, /HSK 4/);
  assert.match(messages[0].content, /在餐厅点餐/);
  assert.match(messages[0].content, /简短纠错/);
  assert.match(messages[0].content, /【跟读句】/);
  assert.match(messages[0].content, /【练习要求】/);
});

test('长会话只向模型发送最近 24 条有效消息', () => {
  const input = Array.from({ length: 32 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `第 ${index + 1} 轮`,
  }));
  const messages = buildMessages({ level: 5, scenario: '求职面试', messages: input });

  assert.equal(messages.length, 25);
  assert.equal(messages[1].content, '第 9 轮');
});

test('百炼客户端使用兼容接口并返回回答', async () => {
  let captured;
  const client = createBailianClient({
    apiKey: 'unit-test-key',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '可以说：我要一碗面。' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const reply = await client.chat({
    level: 3,
    scenario: '在餐厅点餐',
    messages: [{ role: 'user', content: '我要一个面条。' }],
  });

  assert.equal(reply, '可以说：我要一碗面。');
  assert.match(captured.url, /dashscope\.aliyuncs\.com/);
  assert.equal(captured.options.headers.Authorization, 'Bearer unit-test-key');
});

test('可通过服务端配置连接局域网 OpenAI 兼容模型', async () => {
  let captured;
  const client = createBailianClient({
    apiKey: 'lan-test-key',
    apiUrl: 'http://192.168.1.9:11434/v1/chat/completions',
    model: 'qwen2.5:14b',
    providerName: '局域网 AI',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '继续练习这句话。' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const reply = await client.chat({ level: 3, scenario: '日常问候', messages: [] });

  assert.equal(reply, '继续练习这句话。');
  assert.equal(captured.url, 'http://192.168.1.9:11434/v1/chat/completions');
  assert.equal(JSON.parse(captured.options.body).model, 'qwen2.5:14b');
});
