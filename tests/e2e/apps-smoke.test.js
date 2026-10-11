import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { after, before } from 'node:test';

import { chromium } from 'playwright';
import { createAppServer } from '../../server/app.js';

const browserPaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

let server;
let browser;
let baseUrl;

before(async () => {
  server = createAppServer({
    tokenSecret: 'e2e-test-secret',
    aiConfigured: true,
    aiClient: { async chat() { return '你好！你的中文很自然。你今天想练习什么？'; } },
    store: {
      async authenticate(username, password) {
        if (username !== 'hskstudent' || password !== 'e2e-test-password-491') return null;
        return { id: 'student-001', username, displayName: '林晓语', role: 'student' };
      },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const executablePath = browserPaths.find(existsSync);
  assert.ok(executablePath, '本机需要安装 Microsoft Edge 或 Google Chrome');
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function installFakeSpeech(page) {
  await page.addInitScript(() => {
    window.__voiceTest = { spoken: [], recognitionStarts: 0 };
    class FakeRecognition {
      start() {
        window.__voiceTest.recognitionStarts += 1;
        this.onstart?.();
        if (window.__voiceTest.recognitionStarts > 1) return;
        queueMicrotask(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ 0: { transcript: '你好，我在学习中文' }, isFinal: true }],
          });
          this.onend?.();
        });
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    class FakeUtterance {
      constructor(text) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        cancel() {},
        getVoices() {
          return [
            { name: 'Generic Chinese', lang: 'zh-CN', default: true },
            { name: 'Microsoft Xiaoxiao Online (Natural)', lang: 'zh-CN', default: false },
          ];
        },
        speak(utterance) {
          window.__voiceTest.spoken.push({ text: utterance.text, voice: utterance.voice?.name });
          queueMicrotask(() => utterance.onend?.());
        },
      },
      configurable: true,
    });
  });
}

async function login(page, path) {
  await installFakeSpeech(page);
  await page.goto(`${baseUrl}${path}`);
  await page.getByLabel('账号').fill('hskstudent');
  await page.getByLabel('密码').fill('e2e-test-password-491');
  await page.getByRole('button', { name: '进入学习空间' }).click();
  await page.getByText('林晓语').waitFor();
}

for (const app of [
  { path: '/studio/', title: 'HSK 对话研习室' },
  { path: '/mission/', title: 'HSK 口语任务站' },
]) {
  test(`${app.title}：登录、文字对话和语音对话冒烟测试`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await login(page, app.path);
    await assert.doesNotReject(() => page.getByRole('heading', { name: app.title }).waitFor());

    await page.getByPlaceholder('输入中文，按 Enter 发送').fill('我想练习点餐。');
    await page.getByRole('button', { name: '发送消息' }).click();
    await page.getByText('你好！你的中文很自然。你今天想练习什么？').waitFor();

    await page.getByLabel('连续语音对话').check();
    await page.getByText('连续模式已开启').waitFor();
    await page.getByRole('button', { name: '开始语音输入' }).click();
    await page.getByText('你好，我在学习中文').waitFor();
    await page.waitForFunction(() => window.__voiceTest.spoken.length >= 2);
    await page.waitForFunction(() => window.__voiceTest.recognitionStarts >= 2);
    const voiceState = await page.evaluate(() => window.__voiceTest);
    assert.equal(voiceState.recognitionStarts, 2);
    assert.equal(voiceState.spoken.at(-1).voice, 'Microsoft Xiaoxiao Online (Natural)');
    await page.locator('.message--user audio').last().waitFor();
    assert.ok(await page.locator('.message--user audio').last().getAttribute('src'));

    const savedMessages = await page.evaluate((storageKey) => {
      return JSON.parse(localStorage.getItem(storageKey)).messages.length;
    }, `hsk-conversation:${app.path.includes('studio') ? 'studio' : 'mission'}`);
    assert.ok(savedMessages >= 4);
    await page.close();
  });
}

test('本机 Edge 原生语音能力：麦克风、识别接口和 Microsoft 中文语音可用', async () => {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/studio/`);
  const capability = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTracks = stream.getAudioTracks().length;
    stream.getTracks().forEach((track) => track.stop());
    const voices = await new Promise((resolve) => {
      const current = speechSynthesis.getVoices();
      if (current.length) return resolve(current);
      const timer = setTimeout(() => resolve(speechSynthesis.getVoices()), 3000);
      speechSynthesis.addEventListener('voiceschanged', () => {
        clearTimeout(timer);
        resolve(speechSynthesis.getVoices());
      }, { once: true });
    });
    const selectedVoice = voices.find((voice) => /^zh/i.test(voice.lang) && /Microsoft/i.test(voice.name));
    const speakResult = await new Promise((resolve) => {
      if (!selectedVoice) return resolve('no-voice');
      const utterance = new SpeechSynthesisUtterance('你好，这是语音功能测试。');
      utterance.voice = selectedVoice;
      utterance.lang = 'zh-CN';
      const timer = setTimeout(() => resolve('timeout'), 8000);
      utterance.onend = () => { clearTimeout(timer); resolve('ended'); };
      utterance.onerror = (event) => { clearTimeout(timer); resolve(`error:${event.error}`); };
      speechSynthesis.speak(utterance);
    });
    return {
      audioTracks,
      recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      synthesis: 'speechSynthesis' in window,
      speakResult,
      microsoftChineseVoices: voices
        .filter((voice) => /^zh/i.test(voice.lang) && /Microsoft/i.test(voice.name))
        .map((voice) => voice.name),
    };
  });

  assert.equal(capability.audioTracks, 1);
  assert.equal(capability.recognition, true);
  assert.equal(capability.synthesis, true);
  assert.ok(capability.microsoftChineseVoices.length > 0);
  assert.equal(capability.speakResult, 'ended');
  await context.close();
});
