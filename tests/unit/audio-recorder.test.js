import assert from 'node:assert/strict';
import test from 'node:test';

import { createAudioRecorder } from '../../apps/shared/audio-recorder.js';

test('跟读录音结束后生成可播放音频并释放麦克风', async () => {
  const events = [];
  const track = { stop() { events.push('track-stopped'); } };
  const stream = { getTracks: () => [track] };
  class FakeMediaRecorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(input, options) {
      assert.equal(input, stream);
      events.push(options.mimeType);
      this.state = 'inactive';
    }
    start() { this.state = 'recording'; events.push('recording'); }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['voice-data'], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }
  const fakeWindow = {
    MediaRecorder: FakeMediaRecorder,
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    URL: { createObjectURL: () => 'blob:voice-playback' },
  };
  const recorder = createAudioRecorder(fakeWindow);

  await recorder.start();
  const recording = await recorder.stop();

  assert.equal(recording.url, 'blob:voice-playback');
  assert.equal(recording.blob.size, 10);
  assert.equal(recording.mimeType, 'audio/webm;codecs=opus');
  assert.deepEqual(events, ['audio/webm;codecs=opus', 'recording', 'track-stopped']);
});
