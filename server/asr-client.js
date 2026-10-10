const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

function languageFromLocale(locale) {
  const normalized = String(locale ?? '').toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('yue')) return 'yue';
  return undefined;
}

export function createBailianAsrClient({
  apiKey,
  apiUrl = DEFAULT_API_URL,
  model = 'qwen3-asr-flash',
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
} = {}) {
  return {
    async transcribe({ audioDataUri, locale = 'zh-CN' }) {
      if (!apiKey) throw new Error('服务器尚未配置 DASHSCOPE_API_KEY');
      if (!/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/i.test(String(audioDataUri ?? ''))) {
        throw new Error('录音必须是 Base64 WAV 数据');
      }
      const language = languageFromLocale(locale);
      const response = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [{
              type: 'input_audio',
              input_audio: { data: audioDataUri },
            }],
          }],
          stream: false,
          asr_options: {
            ...(language ? { language } : {}),
            enable_itn: true,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = payload?.error?.message || payload?.message || '';
        } catch {
          detail = '';
        }
        throw new Error(detail || `百炼语音识别失败（HTTP ${response.status}）`);
      }
      const payload = await response.json();
      const transcript = payload?.choices?.[0]?.message?.content;
      if (typeof transcript !== 'string' || !transcript.trim()) {
        throw new Error('百炼语音识别返回了空文本');
      }
      return transcript.trim();
    },
  };
}
