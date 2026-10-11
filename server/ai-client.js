const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MAX_HISTORY_MESSAGES = 24;

function normalizeLevel(level) {
  const numericLevel = Number(level);
  return Number.isInteger(numericLevel) && numericLevel >= 1 && numericLevel <= 6
    ? numericLevel
    : 3;
}

function normalizeScenario(scenario) {
  const value = String(scenario ?? '').trim();
  return value.slice(0, 80) || '自由对话';
}

export function buildMessages({ level, scenario, messages }) {
  const safeLevel = normalizeLevel(level);
  const safeScenario = normalizeScenario(scenario);
  const validHistory = Array.isArray(messages)
    ? messages
      .filter((message) => ['user', 'assistant'].includes(message?.role))
      .map((message) => ({
        role: message.role,
        content: String(message.content ?? '').trim().slice(0, 2000),
      }))
      .filter((message) => message.content)
      .slice(-MAX_HISTORY_MESSAGES)
    : [];

  return [
    {
      role: 'system',
      content: [
        `你是一名耐心的 HSK ${safeLevel} 中文口语教练。`,
        `当前练习场景是“${safeScenario}”。`,
        '请主要使用符合学习者等级的简体中文，每次回答控制在 2 到 4 句。',
        '先自然回应学习者，再在确有错误时给出一句简短纠错，最后用一个问题推动对话。',
        '回答末尾必须另起两行，严格使用“【跟读句】一句适合学习者模仿的中文”和“【练习要求】一条具体的声调、停顿或流利度要求”。',
        '不要使用 Markdown 表格，不要一次讲解太多语法，不要替学习者完成整段独白。',
      ].join(''),
    },
    ...validHistory,
  ];
}

export function createBailianClient({
  apiKey,
  apiUrl = DEFAULT_API_URL,
  model = 'qwen-plus',
  providerName = '百炼',
  fetchImpl = globalThis.fetch,
  timeoutMs = 45_000,
} = {}) {
  return {
    async chat(input) {
      if (!apiKey) throw new Error('服务器尚未配置 AI_API_KEY 或 DASHSCOPE_API_KEY');
      if (typeof fetchImpl !== 'function') throw new Error('当前 Node 运行时不支持 fetch');

      const response = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(input),
          temperature: 0.65,
          max_tokens: 320,
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
        throw new Error(detail || `${providerName}请求失败（HTTP ${response.status}）`);
      }

      const payload = await response.json();
      const reply = payload?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) {
        throw new Error(`${providerName}返回了空回答`);
      }
      return reply.trim();
    },
  };
}

export const bailianDefaults = {
  apiUrl: DEFAULT_API_URL,
  maxHistoryMessages: MAX_HISTORY_MESSAGES,
};
