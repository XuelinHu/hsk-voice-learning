import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { chromium } from 'playwright';
import { createAppServer } from '../../server/app.js';

const audioPath = resolve('test-results', 'audio', 'hsk-recognition-input.wav');
const server = createAppServer({
  tokenSecret: 'stt-test-secret',
  aiConfigured: true,
  aiClient: { async chat() { return '语音识别测试'; } },
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${audioPath}`,
  ],
});

try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/studio/`);
  const result = await page.evaluate(async () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return { ok: false, error: 'unsupported' };
    return new Promise((resolveResult) => {
      const recognition = new Recognition();
      recognition.lang = 'zh-CN';
      recognition.interimResults = false;
      recognition.continuous = false;
      const timer = setTimeout(() => {
        recognition.abort();
        resolveResult({ ok: false, error: 'timeout' });
      }, 20_000);
      recognition.onresult = (event) => {
        clearTimeout(timer);
        resolveResult({ ok: true, transcript: event.results[0][0].transcript });
      };
      recognition.onerror = (event) => {
        clearTimeout(timer);
        resolveResult({ ok: false, error: event.error });
      };
      recognition.start();
    });
  });
  assert.equal(result.ok, true, `Edge 在线识别失败：${result.error || 'unknown'}`);
  assert.match(result.transcript, /你好|中文|口语/);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
