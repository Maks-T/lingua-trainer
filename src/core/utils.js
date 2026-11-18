/**
 * Общие утилиты интерфейса и обработки текста.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Честное перемешивание Фишера–Йетса (sort(() => Math.random() - 0.5) даёт смещённый результат). */
export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const PUNCTUATION_RE = /[.,!?;:«»„“”"'’‘()\[\]—–-]/g;

/** Нормализация слова для сравнения: регистр, пунктуация, апострофы. */
export function normalizeWord(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(PUNCTUATION_RE, '')
    .trim();
}

/** Нормализация фразы: слова через один пробел, без пунктуации. */
export function normalizePhrase(str) {
  return String(str ?? '')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean)
    .join(' ');
}

/** Немецкие замены: ae→ä, oe→ö, ue→ü, ss→ß — чтобы принимать ввод без спецраскладки. */
export function foldGerman(str) {
  return normalizeWord(str)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/** Разбивает текст на токены: слова и всё, что между ними (пробелы, пунктуация). */
export function tokenize(text) {
  const tokens = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*(?:-[\p{L}\p{N}]+)*/gu;
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) tokens.push({ type: 'sep', text: text.slice(last, match.index) });
    tokens.push({ type: 'word', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ type: 'sep', text: text.slice(last) });
  return tokens;
}

/** Нажатие клавиши пришло из поля ввода — глобальные хоткеи не должны срабатывать. */
export function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Открыто ли модальное окно (тогда хоткеи упражнений отключаются). */
export function isModalOpen() {
  const modal = document.getElementById('settings-modal');
  return Boolean(modal && !modal.hidden);
}

export function toast(message, type = 'info', timeout = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

/** Пустое состояние для режима без данных. */
export function emptyState(icon, title, text = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      ${text ? `<p>${text}</p>` : ''}
    </div>
  `;
}

/** Шапка упражнения: заголовок режима, счётчик и полоска прогресса. */
export function exerciseHeader(title, index, total) {
  const pct = total ? Math.round((index / total) * 100) : 0;
  return `
    <div class="exercise-head">
      <span class="exercise-kicker">${escapeHtml(title)}</span>
      <span class="exercise-counter">${Math.min(index + 1, total)} / ${total}</span>
    </div>
    <div class="exercise-progress"><span style="width:${pct}%"></span></div>
  `;
}

/** Экран завершения режима. */
export function finishScreen({ icon = '🎉', title, correct, total, restartId }) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return `
    <div class="finish-screen">
      <div class="finish-icon">${icon}</div>
      <h2>${escapeHtml(title)}</h2>
      <p class="finish-score">Правильно с первой попытки: <strong>${correct}</strong> из ${total} (${pct}%)</p>
      <button type="button" class="btn btn-primary" id="${restartId}">Пройти заново</button>
    </div>
  `;
}

export const LANG_LOCALES = { de: 'de-DE', en: 'en-GB', pl: 'pl-PL', es: 'es-ES' };

const SPEAKER_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

export const ICONS = {
  speaker: SPEAKER_SVG,
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  puzzle:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/></svg>',
};

/** Кнопка «Прослушать» в стиле макета. */
export function listenButton(id, label = 'Прослушать', sub = 'Оригинальное произношение') {
  return `
    <button type="button" class="listen-btn" id="${id}">
      <span class="listen-icon">${SPEAKER_SVG}</span>
      <span class="listen-label"><strong>${escapeHtml(label)}</strong>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</span>
    </button>
  `;
}

/** Воспроизведение с подсветкой кнопки. */
export function playWithButton(audioManager, btn, url, text, lang, options = {}) {
  btn?.classList.add('playing');
  audioManager.playSpeech(url, null, () => btn?.classList.remove('playing'), text, lang, options);
}

/** Показ блока обратной связи. */
export function showFeedback(el, type, title, details = '') {
  if (!el) return;
  const icon = type === 'success' ? '✓' : type === 'warning' ? '!' : '✕';
  el.className = `feedback show ${type}`;
  el.innerHTML = `
    <span class="feedback-icon">${icon}</span>
    <span class="feedback-body"><span>${title}</span>${details ? `<small>${details}</small>` : ''}</span>
  `;
}

/** Расстояние Левенштейна — для «почти верно» в диктанте. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
