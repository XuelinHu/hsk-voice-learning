const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

export function createAudioRecorder(windowObject = globalThis.window) {
  const MediaRecorderClass = windowObject?.MediaRecorder;
  const mediaDevices = windowObject?.navigator?.mediaDevices;
  const urlApi = windowObject?.URL;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let mimeType = '';

  function stopTracks() {
    stream?.getTracks?.().forEach((track) => track.stop());
    stream = null;
  }

  return {
    supported: Boolean(MediaRecorderClass && mediaDevices?.getUserMedia && urlApi?.createObjectURL),

    async start() {
      if (!MediaRecorderClass || !mediaDevices?.getUserMedia || !urlApi?.createObjectURL) {
        throw new Error('当前浏览器不支持跟读录音');
      }
      if (recorder?.state === 'recording') return;
      stream = await mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mimeType = MIME_CANDIDATES.find((candidate) => (
        typeof MediaRecorderClass.isTypeSupported !== 'function'
        || MediaRecorderClass.isTypeSupported(candidate)
      )) || '';
      chunks = [];
      recorder = new MediaRecorderClass(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.start();
    },

    stop() {
      if (!recorder || recorder.state === 'inactive') {
        stopTracks();
        return Promise.resolve(null);
      }
      return new Promise((resolve, reject) => {
        recorder.onerror = (event) => {
          stopTracks();
          reject(new Error(event?.error?.message || '跟读录音失败'));
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType || chunks[0]?.type || 'audio/webm' });
          stopTracks();
          recorder = null;
          chunks = [];
          if (!blob.size) {
            resolve(null);
            return;
          }
          resolve({
            blob,
            mimeType: mimeType || blob.type,
            url: urlApi.createObjectURL(blob),
          });
        };
        recorder.stop();
      });
    },

    revoke(url) {
      if (url) urlApi?.revokeObjectURL?.(url);
    },
  };
}
