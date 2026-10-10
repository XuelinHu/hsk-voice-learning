import assert from 'node:assert/strict';
import test from 'node:test';

import { createBailianAsrClient } from '../../server/asr-client.js';

test('百炼 ASR 使用 Base64 WAV 和中文语言提示', async () => {
  let requestBody;
  const client = createBailianAsrClient({
    apiKey: 'asr-test-key',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: '你好，我在学习中文。' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const transcript = await client.transcribe({
    audioDataUri: 'data:audio/wav;base64,UklGRg==',
    locale: 'zh-CN',
  });

  assert.equal(transcript, '你好，我在学习中文。');
  assert.equal(requestBody.model, 'qwen3-asr-flash');
  assert.equal(requestBody.messages[0].content[0].type, 'input_audio');
  assert.equal(requestBody.messages[0].content[0].input_audio.data, 'data:audio/wav;base64,UklGRg==');
  assert.equal(requestBody.asr_options.language, 'zh');
});
