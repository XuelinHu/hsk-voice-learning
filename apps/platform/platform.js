const $ = (id) => document.getElementById(id);
const DEMO = {
  student01: { username: 'student01', password: 'Maple-Study-2026-01!' }, student02: { username: 'student02', password: 'Maple-Study-2026-02!' },
  student03: { username: 'student03', password: 'Maple-Study-2026-03!' }, student04: { username: 'student04', password: 'Maple-Study-2026-04!' },
  student05: { username: 'student05', password: 'Maple-Study-2026-05!' }, student06: { username: 'student06', password: 'Maple-Study-2026-06!' },
  student07: { username: 'student07', password: 'Maple-Study-2026-07!' }, student08: { username: 'student08', password: 'Maple-Study-2026-08!' },
  student09: { username: 'student09', password: 'Maple-Study-2026-09!' }, student10: { username: 'student10', password: 'Maple-Study-2026-10!' },
  admin01: { username: 'admin01', password: 'Console-Admin-2026-01!' }, admin02: { username: 'admin02', password: 'Console-Admin-2026-02!' },
};
let user = null;
let questions = [];
let attempts = new Set();
let roundCorrect = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(user?.token ? { authorization: `Bearer ${user.token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

function login(session) {
  user = session;
  sessionStorage.setItem('hsk-platform-user', JSON.stringify(user));
  $('login').hidden = true;
  $('app').hidden = false;
  $('account-name').textContent = `${user.displayName} · ${user.role === 'teacher' ? '管理员' : '学员'}`;
  $('admin-nav').hidden = user.role !== 'teacher';
  void render();
  void renderStats();
}

async function authenticate(username, password) {
  $('login-error').textContent = '';
  try {
    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, appId: 'hsk-platform' }),
    });
    login({ ...result.user, token: result.token });
  } catch (error) {
    $('login-error').textContent = error.message;
  }
}

async function render() {
  const level = Number($('level').value);
  const section = $('section').value;
  const params = new URLSearchParams({ level: String(level), section });
  try {
    const result = await api(`/api/practice/questions?${params}`);
    questions = result.questions;
    $('source-links').innerHTML = result.sources.map((source) =>
      `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`,
    ).join('');
    attempts = new Set();
    roundCorrect = 0;
    $('score').textContent = `0 / ${questions.length}`;
    $('score-bar').className = 'score-bar--0';
    $('question-list').innerHTML = questions.length ? questions.map((question, index) => `
      <article class="question" data-id="${escapeHtml(question.id)}">
        <h2>${index + 1}. ${escapeHtml(question.question)}</h2>
        ${question.audioText ? `<button class="speak" data-speak="${escapeHtml(question.audioText)}">🔊 朗读听力</button>` : ''}
        <div class="options">${question.options.map((option, optionIndex) => `<button data-answer="${optionIndex + 1}">${optionIndex + 1}. ${escapeHtml(option)}</button>`).join('')}</div>
        <div class="explain" hidden></div>
        <small class="muted">${escapeHtml(question.source || 'HSK 题型结构参考练习')}</small>
      </article>`).join('') : '<div class="question"><h2>该等级暂无此专项题目</h2><p class="muted">管理员可以发布新题目。</p></div>';
    bindQuestions();
  } catch (error) {
    $('question-list').textContent = error.message;
  }
}

function bindQuestions() {
  document.querySelectorAll('[data-speak]').forEach((button) => {
    button.onclick = () => speak(button.dataset.speak);
  });
  document.querySelectorAll('.question').forEach((card) => {
    card.querySelectorAll('[data-answer]').forEach((button) => {
      button.onclick = async () => {
        const question = questions.find((item) => item.id === card.dataset.id);
        if (!question || attempts.has(question.id)) return;
        attempts.add(question.id);
        card.querySelectorAll('[data-answer]').forEach((option) => { option.disabled = true; });
        try {
          const result = await api('/api/practice/attempts', {
            method: 'POST',
            body: JSON.stringify({ questionId: question.id, level: question.level, section: question.section, answer: Number(button.dataset.answer) }),
          });
          button.classList.add(result.correct ? 'correct' : 'wrong');
          if (!result.correct) card.querySelector(`[data-answer="${result.correctAnswer}"]`)?.classList.add('correct');
          card.querySelector('.explain').textContent = result.explanation;
          card.querySelector('.explain').hidden = false;
          if (result.correct) roundCorrect += 1;
          $('score').textContent = `${roundCorrect} / ${questions.length}`;
          const percentage = questions.length ? Math.round(roundCorrect / questions.length * 100 / 25) * 25 : 0;
          $('score-bar').className = `score-bar--${percentage}`;
          await renderStats();
        } catch (error) {
          attempts.delete(question.id);
          card.querySelectorAll('[data-answer]').forEach((option) => { option.disabled = false; });
          card.querySelector('.explain').textContent = error.message;
          card.querySelector('.explain').hidden = false;
        }
      };
    });
  });
}

async function renderStats() {
  try {
    const stats = await api('/api/practice/stats');
    $('stat-total').textContent = stats.total;
    $('stat-rate').textContent = `${stats.total ? Math.round(stats.correct / stats.total * 100) : 0}%`;
    $('chart').innerHTML = ['listening', 'reading', 'speaking'].map((section, index) => {
      const label = { listening: '听力', reading: '阅读', speaking: '口语' }[section];
      const data = stats.bySection[section] || { total: 0, rate: 0 };
      const tier = data.total ? Math.min(4, Math.max(1, Math.ceil(data.rate / 25))) : 0;
      return `<div class="chart__bar chart__bar--${tier}" aria-label="${label}正确率 ${Math.round(data.rate)}%"><span>${label} ${Math.round(data.rate)}% · ${data.total}题</span></div>`;
    }).join('');
  } catch (error) {
    $('stat-total').textContent = '—';
    $('stat-rate').textContent = '—';
    $('chart').textContent = error.message;
  }
}

async function renderPublished() {
  if (user?.role !== 'teacher') return;
  const params = new URLSearchParams({ level: $('new-level').value, section: $('new-section').value });
  try {
    const result = await api(`/api/practice/questions?${params}`);
    $('published').innerHTML = result.questions.filter((question) => !String(question.id).startsWith('sample-')).map((question) =>
      `<article><b>HSK ${question.level} · ${escapeHtml(question.section)}</b><br>${escapeHtml(question.question)}</article>`,
    ).join('');
  } catch (error) {
    $('published').textContent = error.message;
  }
}

$('demo-login').onclick = () => {
  const account = DEMO[$('demo-account').value];
  if (account) void authenticate(account.username, account.password);
};
$('manual-login').onsubmit = (event) => {
  event.preventDefault();
  void authenticate($('login-user').value, $('login-pass').value);
};
$('logout').onclick = () => {
  sessionStorage.removeItem('hsk-platform-user');
  location.reload();
};
document.querySelectorAll('nav [data-view]').forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== button.dataset.view; });
    document.querySelectorAll('nav button').forEach((item) => item.classList.toggle('active', item === button));
    if (button.dataset.view === 'stats') void renderStats();
    if (button.dataset.view === 'admin') void renderPublished();
  };
});
$('level').onchange = () => void render();
$('section').onchange = () => void render();
$('new-level').onchange = () => void renderPublished();
$('new-section').onchange = () => void renderPublished();
$('speak-tip').onclick = () => speak('请先点击朗读，听清楚后再跟读。');
$('publish-form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/admin/questions', {
      method: 'POST',
      body: JSON.stringify({
        level: Number($('new-level').value), section: $('new-section').value,
        question: $('new-question').value,
        options: $('new-options').value.split('|').map((option) => option.trim()),
        answer: Number($('new-answer').value),
        explanation: $('new-explanation').value,
        audioText: $('new-audio').value,
      }),
    });
    form.reset();
    await renderPublished();
    await render();
  } catch (error) {
    $('publish-error').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};

try {
  const session = JSON.parse(sessionStorage.getItem('hsk-platform-user'));
  if (session?.token) login(session);
} catch {
  sessionStorage.removeItem('hsk-platform-user');
}
