export function selectChineseVoice(voices = []) {
  const chineseVoices = voices.filter((voice) => /^zh(?:-|_)/i.test(voice.lang || ''));
  if (!chineseVoices.length) return voices.find((voice) => voice.default) || voices[0] || null;
  return chineseVoices.find((voice) => /Microsoft|Xiaoxiao|Yunxi|Xiaoyi/i.test(voice.name || ''))
    || chineseVoices.find((voice) => voice.default)
    || chineseVoices[0];
}

function collectTranscript(event) {
  let interim = '';
  let finalText = '';
  for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = result?.[0]?.transcript?.trim() || '';
    if (result?.isFinal) finalText += text;
    else interim += text;
  }
  return { finalText, interim };
}

export function createSpeechEngine(windowObject = globalThis.window) {
  const Recognition = windowObject?.SpeechRecognition || windowObject?.webkitSpeechRecognition;
  const synthesis = windowObject?.speechSynthesis;
  const Utterance = windowObject?.SpeechSynthesisUtterance;
  let recognition = null;

  return {
    support: {
      recognition: Boolean(Recognition),
      synthesis: Boolean(synthesis && Utterance),
    },

    listen({ onFinal, onInterim, onStart, onEnd, onError } = {}) {
      if (!Recognition) throw new Error('当前浏览器不支持语音识别，请使用最新版 Edge 或 Chrome');
      recognition?.abort?.();
      recognition = new Recognition();
      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => onStart?.();
      recognition.onresult = (event) => {
        const { finalText, interim } = collectTranscript(event);
        if (interim) onInterim?.(interim);
        if (finalText) onFinal?.(finalText);
      };
      recognition.onerror = (event) => onError?.(event?.error || 'unknown');
      recognition.onend = () => onEnd?.();
      recognition.start();
      return recognition;
    },

    stopListening() {
      recognition?.stop?.();
    },

    cancel() {
      recognition?.abort?.();
      synthesis?.cancel?.();
    },

    async speak(text, { rate = 0.92, pitch = 1 } = {}) {
      if (!synthesis || !Utterance) {
        throw new Error('当前浏览器不支持文本转语音');
      }
      synthesis.cancel();
      const utterance = new Utterance(String(text));
      utterance.lang = 'zh-CN';
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.voice = selectChineseVoice(synthesis.getVoices());
      return new Promise((resolve, reject) => {
        utterance.onend = resolve;
        utterance.onerror = (event) => reject(new Error(event?.error || '语音播放失败'));
        synthesis.speak(utterance);
      });
    },

    getVoiceName() {
      return selectChineseVoice(synthesis?.getVoices?.() || [])?.name || '浏览器默认中文语音';
    },
  };
}
