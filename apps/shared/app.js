import { createSpeechEngine } from './speech-engine.js';
import { createAudioRecorder } from './audio-recorder.js';
import { parseCoachReply } from './coach-reply.js';

const appId = document.body.dataset.app;
const storageKey = `hsk-conversation:${appId}`;
const sessionKey = `hsk-session:${appId}`;
const speech = createSpeechEngine(window);
const audioRecorder = createAudioRecorder(window);
const elements = {
  loginOverlay: document.querySelector('#login-overlay'),
  loginForm: document.querySelector('#login-form'),
  loginError: document.querySelector('#login-error'),
  username: document.querySelector('#username'),
  password: document.querySelector('#password'),
  userName: document.querySelector('#user-name'),
  logout: document.querySelector('#logout-button'),
  chat: document.querySelector('#chat-log'),
  form: document.querySelector('#message-form'),
  input: document.querySelector('#message-input'),
  send: document.querySelector('#send-button'),
  mic: document.querySelector('#mic-button'),
  continuous: document.querySelector('#continuous-mode'),
  continuousStatus: document.querySelector('#continuous-status'),
  voiceStatus: document.querySelector('#voice-status'),
  voiceName: document.querySelector('#voice-name'),
  scenario: document.querySelector('#scenario'),
  level: document.querySelector('#hsk-level'),
  reset: document.querySelector('#reset-button'),
  duration: document.querySelector('#session-duration'),
  messageCount: document.querySelector('#message-count'),
  points: document.querySelector('#points'),
  progress: document.querySelector('#mission-progress'),
  currentScenario: document.querySelectorAll('[data-current-scenario]'),
};

const state = {
  token: '',
  user: null,
  messages: [],
  busy: false,
  listening: false,
  continuous: false,
  startedAt: Date.now(),
  restartTimer: null,
  recording: false,
};

function readStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function escapeText(value) {
  const holder = document.createElement('span');
  holder.textContent = value;
  return holder.innerHTML;
}

function formatTime(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function updateStats() {
  const learnerTurns = state.messages.filter((message) => message.role === 'user').length;
  elements.messageCount.textContent = String(learnerTurns);
  if (elements.points) elements.points.textContent = String(learnerTurns * 15);
  if (elements.progress) {
    const percentage = Math.min(100, learnerTurns * 20);
    elements.progress.style.width = `${percentage}%`;
    elements.progress.parentElement?.setAttribute('aria-valuenow', String(percentage));
  }
}

function saveConversation() {
  localStorage.setItem(storageKey, JSON.stringify({
    messages: state.messages.slice(-80).map(({ role, content }) => ({ role, content })),
    scenario: elements.scenario.value,
    level: Number(elements.level.value),
    updatedAt: Date.now(),
  }));
  updateStats();
}

function addMessage(role, content, { pending = false, persist = true, recording = null } = {}) {
  const emptyState = elements.chat.querySelector('.empty-conversation');
  emptyState?.remove();
  const article = document.createElement('article');
  article.className = `message message--${role}${pending ? ' message--pending' : ''}`;
  const coachReply = role === 'assistant' && !pending ? parseCoachReply(content) : null;
  const visibleContent = coachReply?.message || content;
  const playback = recording?.url ? `
    <div class="voice-playback">
      <span>我的跟读录音</span>
      <audio controls preload="metadata" src="${escapeText(recording.url)}" aria-label="播放本次跟读录音"></audio>
    </div>
  ` : '';
  const practice = coachReply ? `
    <div class="coach-practice">
      ${coachReply.shadowing ? `<div><span>跟读句</span><strong>${escapeText(coachReply.shadowing)}</strong></div>` : ''}
      <div><span>练习要求</span><strong>${escapeText(coachReply.requirement)}</strong></div>
    </div>
  ` : '';
  article.innerHTML = `
    <div class="message__meta">
      <span>${role === 'user' ? escapeText(state.user?.displayName || '我') : 'AI 中文教练'}</span>
      <time>${formatTime()}</time>
    </div>
    <p>${escapeText(visibleContent)}</p>
    ${playback}
    ${practice}
  `;
  elements.chat.append(article);
  elements.chat.scrollTop = elements.chat.scrollHeight;
  if (!pending && persist) {
    state.messages.push({ role, content, recording });
    saveConversation();
  }
  return article;
}

function renderHistory() {
  elements.chat.innerHTML = '';
  if (!state.messages.length) {
    const scenario = elements.scenario.options[elements.scenario.selectedIndex]?.text || '自由对话';
    elements.chat.innerHTML = `
      <div class="empty-conversation">
        <span class="empty-conversation__character" aria-hidden="true">说</span>
        <h2>从一句简单的中文开始</h2>
        <p>当前场景：${escapeText(scenario)}。可以输入文字，也可以直接开始语音输入。</p>
      </div>
    `;
  } else {
    state.messages.forEach((message) => addMessage(message.role, message.content, {
      persist: false,
      recording: message.recording,
    }));
  }
  updateStats();
}

function setVoiceStatus(text, tone = 'ready') {
  elements.voiceStatus.textContent = text;
  elements.voiceStatus.dataset.tone = tone;
}

function setBusy(busy) {
  state.busy = busy;
  elements.send.disabled = busy;
  elements.mic.disabled = busy;
  elements.input.disabled = busy;
  elements.send.textContent = busy ? '等待回复' : '发送';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

async function sendMessage(rawText, { recording = null } = {}) {
  const text = String(rawText || '').trim();
  if (!text || state.busy) return;
  clearTimeout(state.restartTimer);
  elements.input.value = '';
  addMessage('user', text, { recording });
  const pending = addMessage('assistant', '教练正在组织语言...', { pending: true, persist: false });
  setBusy(true);
  setVoiceStatus('AI 正在回应', 'working');
  try {
    const result = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        level: Number(elements.level.value),
        scenario: elements.scenario.value,
        messages: state.messages,
      }),
    });
    pending.remove();
    addMessage('assistant', result.reply);
    const coachReply = parseCoachReply(result.reply);
    setVoiceStatus('正在朗读教练回复', 'speaking');
    const spokenReply = coachReply.shadowing
      ? `${coachReply.message}。请跟读：${coachReply.shadowing}`
      : coachReply.message;
    await speech.speak(spokenReply);
    setVoiceStatus('语音已就绪', 'ready');
    if (state.continuous) {
      state.restartTimer = setTimeout(() => startListening(), 350);
    }
  } catch (error) {
    pending.remove();
    addMessage('system', error.message, { persist: false });
    setVoiceStatus(error.message, 'error');
  } finally {
    setBusy(false);
    elements.input.focus();
  }
}

async function startListening() {
  if (state.listening || state.busy) return;
  if (!speech.support.recognition) {
    setVoiceStatus('当前浏览器不支持语音识别，请使用最新版 Edge 或 Chrome', 'error');
    return;
  }
  let finalTranscript = '';
  let finalized = false;
  async function finalizeVoiceTurn() {
    if (finalized) return;
    finalized = true;
    let recording = null;
    try {
      recording = await audioRecorder.stop();
    } catch (error) {
      setVoiceStatus(error.message, 'error');
    } finally {
      state.recording = false;
    }
    if (finalTranscript) {
      setVoiceStatus(recording ? '录音已生成，正在发送' : '识别完成，正在发送', 'working');
      await sendMessage(finalTranscript, { recording });
    } else if (recording?.url) {
      audioRecorder.revoke(recording.url);
    }
  }
  try {
    await audioRecorder.start();
    state.recording = true;
    speech.listen({
      onStart() {
        state.listening = true;
        elements.mic.classList.add('is-listening');
        elements.mic.setAttribute('aria-label', '停止语音输入');
        setVoiceStatus('正在听，请说中文', 'listening');
      },
      onInterim(text) {
        elements.input.value = text;
      },
      onFinal(text) {
        finalTranscript = text;
        elements.input.value = text;
      },
      onEnd() {
        state.listening = false;
        elements.mic.classList.remove('is-listening');
        elements.mic.setAttribute('aria-label', '开始语音输入');
        void finalizeVoiceTurn();
      },
      onError(error) {
        state.listening = false;
        const messages = {
          'not-allowed': '麦克风权限未开启',
          'no-speech': '没有听到声音，请再试一次',
          network: '语音识别网络暂时不可用',
        };
        setVoiceStatus(messages[error] || `语音识别失败：${error}`, 'error');
        void finalizeVoiceTurn();
      },
    });
  } catch (error) {
    setVoiceStatus(error.message, 'error');
  }
}

function stopListening() {
  clearTimeout(state.restartTimer);
  speech.stopListening();
  state.listening = false;
  elements.mic.classList.remove('is-listening');
  elements.mic.setAttribute('aria-label', '开始语音输入');
  setVoiceStatus('语音输入已暂停', 'ready');
}

function restoreConversation() {
  const saved = readStoredJson(storageKey, {});
  state.messages = Array.isArray(saved.messages) ? saved.messages.slice(-80) : [];
  if (saved.scenario && [...elements.scenario.options].some((option) => option.value === saved.scenario)) {
    elements.scenario.value = saved.scenario;
  }
  if (saved.level) elements.level.value = String(saved.level);
  renderHistory();
  syncScenarioLabels();
}

function syncScenarioLabels() {
  const label = elements.scenario.options[elements.scenario.selectedIndex]?.text || elements.scenario.value;
  elements.currentScenario.forEach((element) => { element.textContent = label; });
}

function completeLogin(session) {
  state.token = session.token;
  state.user = session.user;
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  elements.userName.textContent = session.user.displayName;
  elements.loginOverlay.hidden = true;
  document.body.classList.add('is-authenticated');
  restoreConversation();
  elements.input.focus();
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.loginError.textContent = '';
  const submit = elements.loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const session = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: elements.username.value,
        password: elements.password.value,
      }),
    });
    completeLogin(session);
  } catch (error) {
    elements.loginError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void sendMessage(elements.input.value);
});

elements.mic.addEventListener('click', () => {
  if (state.listening) stopListening();
  else startListening();
});

elements.continuous.addEventListener('change', () => {
  state.continuous = elements.continuous.checked;
  elements.continuousStatus.textContent = state.continuous ? '连续模式已开启' : '单轮语音模式';
  if (!state.continuous) clearTimeout(state.restartTimer);
});

elements.scenario.addEventListener('change', () => {
  syncScenarioLabels();
  saveConversation();
  renderHistory();
});

elements.level.addEventListener('change', saveConversation);

elements.reset.addEventListener('click', () => {
  speech.cancel();
  clearTimeout(state.restartTimer);
  state.messages.forEach((message) => audioRecorder.revoke(message.recording?.url));
  state.messages = [];
  state.startedAt = Date.now();
  saveConversation();
  renderHistory();
  setVoiceStatus('新会话已开始', 'ready');
});

elements.logout.addEventListener('click', () => {
  speech.cancel();
  sessionStorage.removeItem(sessionKey);
  state.token = '';
  state.user = null;
  document.body.classList.remove('is-authenticated');
  elements.loginOverlay.hidden = false;
  elements.password.value = '';
  elements.username.focus();
});

setInterval(() => {
  const elapsed = Math.max(0, Date.now() - state.startedAt);
  const minutes = Math.floor(elapsed / 60_000).toString().padStart(2, '0');
  const seconds = Math.floor((elapsed % 60_000) / 1000).toString().padStart(2, '0');
  elements.duration.textContent = `${minutes}:${seconds}`;
}, 1000);

elements.voiceName.textContent = speech.getVoiceName();
if (!speech.support.recognition || !speech.support.synthesis) {
  setVoiceStatus('部分语音能力不可用，请使用最新版 Edge 或 Chrome', 'error');
}

try {
  const existingSession = JSON.parse(sessionStorage.getItem(sessionKey));
  if (existingSession?.token && existingSession?.user) completeLogin(existingSession);
} catch {
  sessionStorage.removeItem(sessionKey);
}
