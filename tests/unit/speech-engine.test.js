import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpeechEngine, selectChineseVoice } from '../../apps/shared/speech-engine.js';

test('优先选择 Microsoft 的简体中文语音', () => {
  const voices = [
    { name: 'Generic Chinese', lang: 'zh-CN', default: true },
    { name: 'Microsoft Xiaoxiao Online (Natural)', lang: 'zh-CN', default: false },
    { name: 'English Voice', lang: 'en-US', default: false },
  ];

  assert.equal(selectChineseVoice(voices).name, 'Microsoft Xiaoxiao Online (Natural)');
});

test('语音引擎完成中文识别并使用选中的语音朗读', async () => {
  const events = [];
  class FakeRecognition {
    start() {
      events.push(['recognition-start', this.lang, this.interimResults]);
      this.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: '我想练习中文' }, isFinal: true }],
      });
      this.onend?.();
    }
    stop() {}
    abort() {}
  }
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const microsoftVoice = { name: 'Microsoft Xiaoxiao', lang: 'zh-CN' };
  const fakeWindow = {
    SpeechRecognition: FakeRecognition,
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      getVoices: () => [microsoftVoice],
      cancel: () => events.push(['cancel']),
      speak: (utterance) => {
        events.push(['speak', utterance.text, utterance.voice.name]);
        queueMicrotask(() => utterance.onend?.());
      },
    },
  };
  const engine = createSpeechEngine(fakeWindow);
  let transcript = '';

  engine.listen({ onFinal: (text) => { transcript = text; } });
  await engine.speak('你好，我们继续练习。');

  assert.equal(transcript, '我想练习中文');
  assert.deepEqual(events[0], ['recognition-start', 'zh-CN', true]);
  assert.deepEqual(events.at(-1), ['speak', '你好，我们继续练习。', 'Microsoft Xiaoxiao']);
});
