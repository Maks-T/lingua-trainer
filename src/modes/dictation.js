import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { getDictationItems } from '../core/exercises.js';
import { createQueue, queueHeader, queueFinish } from '../core/queue.js';
import {
  escapeHtml,
  shuffle,
  tokenize,
  normalizeWord,
  foldGerman,
  levenshtein,
  isModalOpen,
  listenButton,
  playWithButton,
  showFeedback,
  emptyState,
  ICONS,
} from '../core/utils.js';

const SETTINGS_KEY = 'lingua_dictation_settings';
const LEVELS = {
  easy: { label: '1 пропуск' },
  medium: { label: 'Несколько' },
  full: { label: 'Целиком' },
};
const SPECIAL_KEYS = {
  de: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'],
  pl: ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'],
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡'],
};

let container = null;

/** Enter/Пробел на кнопке внутри упражнения сработает как клик — не дублируем. */
const isOwnButton = (e) => e.target instanceof HTMLButtonElement && Boolean(container?.contains(e.target));
let unit = null;
let settings = loadSettings();
let queue = null;
let lastCorrect = false;
let tokens = [];
let gaps = []; // { tokenIndex, answer, input }
let checked = false;
let lastFocused = null;

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      source: saved?.source === 'text' ? 'text' : 'sentences',
      level: LEVELS[saved?.level] ? saved.level : 'easy',
    };
  } catch {
    return { source: 'sentences', level: 'easy' };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** Слова из словаря урока важнее для тренировки — пропускаем их в первую очередь. */
function vocabularyStems() {
  return (unit.words || [])
    .map((w) => normalizeWord(w.target))
    .filter((w) => w.length >= 3)
    .map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w));
}

function pickGaps(toks) {
  const wordIdx = toks.map((t, i) => (t.type === 'word' ? i : -1)).filter((i) => i !== -1);
  if (settings.level === 'full') return wordIdx;

  const stems = vocabularyStems();
  const score = (i) => {
    const w = normalizeWord(toks[i].text);
    if (stems.some((s) => w.startsWith(s))) return 3;
    if (w.length >= 5) return 2;
    if (w.length >= 3) return 1;
    return 0;
  };
  const count = settings.level === 'easy' ? 1 : Math.min(5, Math.max(2, Math.round(wordIdx.length / 4)));
  const ranked = shuffle(wordIdx).sort((a, b) => score(b) - score(a));
  return ranked.slice(0, Math.min(count, wordIdx.length)).sort((a, b) => a - b);
}

function start() {
  queue = createQueue(shuffle(getDictationItems(unit, settings.source)));
  renderItem();
}

function settingsHtml() {
  const hasText = getDictationItems(unit, 'text').length > 0;
  const hasSentences = getDictationItems(unit, 'sentences').length > 0;
  return `
    <div class="dictation-settings">
      <div class="segmented" role="group" aria-label="Источник">
        <button type="button" data-source="sentences" class="${settings.source === 'sentences' ? 'active' : ''}" ${hasSentences ? '' : 'disabled'}>Фразы</button>
        <button type="button" data-source="text" class="${settings.source === 'text' ? 'active' : ''}" ${hasText ? '' : 'disabled'}>Текст</button>
      </div>
      <div class="segmented" role="group" aria-label="Сложность">
        ${Object.entries(LEVELS)
          .map(
            ([key, meta]) =>
              `<button type="button" data-level="${key}" class="${settings.level === key ? 'active' : ''}">${meta.label}</button>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function bindSettings() {
  container.querySelectorAll('[data-source]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (settings.source === btn.dataset.source) return;
      settings.source = btn.dataset.source;
      saveSettings();
      audio.playClick();
      start();
    })
  );
  container.querySelectorAll('[data-level]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (settings.level === btn.dataset.level) return;
      settings.level = btn.dataset.level;
      saveSettings();
      audio.playClick();
      // Меняем сложность для текущего задания, не сбрасывая прогресс серии
      renderItem();
    })
  );
}

function renderFinish() {
  audio.playWin();
  container.innerHTML = queueFinish({ icon: '🎧', title: 'Диктант завершён!', q: queue, restartId: 'dictation-restart' });
  container.querySelector('#dictation-restart')?.addEventListener('click', start);
}

function renderItem() {
  if (!container) return;
  if (!queue.total) {
    // Выбранного источника в уроке нет — переключаемся на другой
    const other = settings.source === 'text' ? 'sentences' : 'text';
    if (getDictationItems(unit, other).length) {
      settings.source = other;
      start();
    }
    return;
  }
  if (queue.done) {
    renderFinish();
    return;
  }

  const item = queue.current;
  checked = false;
  tokens = tokenize(item.target);
  const gapIdx = new Set(pickGaps(tokens));
  gaps = [];

  const textHtml = tokens
    .map((tok, i) => {
      if (!gapIdx.has(i)) return escapeHtml(tok.text);
      const gapNo = gaps.length;
      gaps.push({ tokenIndex: i, answer: tok.text, input: null });
      const width = Math.max(3, tok.text.length + 1.5);
      return `<input class="gap-input" data-gap="${gapNo}" style="width:${width}ch" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Пропуск ${gapNo + 1}" />`;
    })
    .join('');

  const specials = SPECIAL_KEYS[unit.lang] || [];

  container.innerHTML = `
    <div class="exercise">
      ${queueHeader('Диктант на слух', queue)}
      ${settingsHtml()}
      <div class="prompt">
        <h1 class="prompt-title" style="font-size:1.35rem">Прослушайте и впишите пропущенные слова</h1>
        ${item.ru ? `<button type="button" class="toggle-ru" id="dict-toggle-ru">Показать перевод</button><div class="prompt-hint" id="dict-ru" hidden>${escapeHtml(item.ru)}</div>` : ''}
      </div>
      <div class="listen-row">
        ${listenButton('dict-listen', 'Прослушать', 'Ctrl + Пробел')}
        ${listenButton('dict-listen-slow', 'Медленно', '0.7×')}
      </div>
      <div class="dictation-text" lang="${escapeHtml(unit.lang)}">${textHtml}</div>
      ${specials.length ? `<div class="special-keys" aria-label="Специальные символы">${specials.map((c) => `<button type="button" data-char="${c}">${c}</button>`).join('')}</div>` : ''}
      <div class="feedback" id="dict-feedback" role="status"></div>
      <div class="controls">
        <button type="button" class="btn btn-secondary" id="dict-hint">💡 Подсказка</button>
        <div class="controls-right">
          <button type="button" class="btn btn-primary" id="dict-check">Проверить ${ICONS.arrow}</button>
          <button type="button" class="btn btn-primary" id="dict-next" hidden>Далее ${ICONS.arrow}</button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.gap-input').forEach((input) => {
    const gap = gaps[Number(input.dataset.gap)];
    gap.input = input;
    input.addEventListener('focus', () => {
      lastFocused = input;
    });
    input.addEventListener('keydown', onGapKeyDown);
  });

  bindSettings();
  container.querySelector('#dict-toggle-ru')?.addEventListener('click', (e) => {
    container.querySelector('#dict-ru').hidden = false;
    e.currentTarget.remove();
  });
  container.querySelector('#dict-listen').addEventListener('click', () => listen());
  container.querySelector('#dict-listen-slow').addEventListener('click', () => listen(true));
  container.querySelectorAll('.special-keys button').forEach((btn) =>
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // не забираем фокус у поля ввода
      insertChar(btn.dataset.char);
    })
  );
  container.querySelector('#dict-hint').addEventListener('click', hint);
  container.querySelector('#dict-check').addEventListener('click', check);
  container.querySelector('#dict-next').addEventListener('click', next);

  gaps[0]?.input?.focus();
  lastFocused = gaps[0]?.input || null;
  setTimeout(() => {
    if (container && queue?.current === item) listen();
  }, 300);
}

function listen(slow = false) {
  if (!container || !unit) return;
  const item = queue?.current;
  if (!item) return;
  const btn = container?.querySelector(slow ? '#dict-listen-slow' : '#dict-listen');
  playWithButton(audio, btn, item.audio, item.target, unit.lang, slow ? { rate: 0.7 } : {});
}

function insertChar(ch) {
  const input = lastFocused && !lastFocused.readOnly ? lastFocused : gaps.find((g) => !g.input.readOnly)?.input;
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + ch + input.value.slice(end);
  input.focus();
  input.setSelectionRange(start + ch.length, start + ch.length);
}

function hint() {
  if (checked) return;
  // Подсказываем следующую букву в активном (или первом неверном) пропуске
  const target =
    (lastFocused && gaps.find((g) => g.input === lastFocused)) ||
    gaps.find((g) => normalizeWord(g.input.value) !== normalizeWord(g.answer));
  if (!target) return;
  const answer = target.answer;
  const typed = target.input.value;
  let common = 0;
  while (common < typed.length && common < answer.length && typed[common].toLowerCase() === answer[common].toLowerCase()) {
    common += 1;
  }
  target.input.value = answer.slice(0, Math.min(answer.length, common + 1));
  target.input.focus();
  audio.playClick();
}

function gradeGap(value, answer) {
  const v = normalizeWord(value);
  const a = normalizeWord(answer);
  if (!v) return 'wrong';
  if (v === a) return 'correct';
  if (unit.lang === 'de' && foldGerman(value) === foldGerman(answer)) return 'correct';
  if (a.length >= 4 && levenshtein(v, a) <= 1) return 'almost';
  return 'wrong';
}

function check() {
  if (checked) return;
  checked = true;
  const item = queue.current;

  let okCount = 0;
  let almostCount = 0;
  gaps.forEach((gap) => {
    const grade = gradeGap(gap.input.value, gap.answer);
    gap.input.readOnly = true;
    gap.input.classList.add(grade);
    if (grade === 'correct') {
      okCount += 1;
      gap.input.value = gap.answer;
    } else {
      if (grade === 'almost') almostCount += 1;
      gap.input.insertAdjacentHTML('afterend', `<span class="gap-fix">${escapeHtml(gap.answer)}</span>`);
    }
  });

  const allCorrect = okCount === gaps.length;
  state.recordAnswer(unit.id, allCorrect, item.key);
  lastCorrect = allCorrect;

  const feedback = container.querySelector('#dict-feedback');
  const fullText = `<span lang="${escapeHtml(unit.lang)}">${escapeHtml(item.target)}</span>`;
  if (allCorrect) {
    audio.playSuccess();
    showFeedback(feedback, 'success', 'Отлично, всё верно!', item.ru ? escapeHtml(item.ru) : '');
  } else if (almostCount && okCount + almostCount === gaps.length) {
    audio.playMistake();
    showFeedback(feedback, 'warning', 'Почти! Есть опечатки — сравните с правильным написанием. 🔁 Фраза вернётся позже.', fullText);
  } else {
    audio.playMistake();
    showFeedback(feedback, 'error', `Верно ${okCount} из ${gaps.length} · 🔁 фраза вернётся позже`, fullText);
  }

  container.querySelector('#dict-check').hidden = true;
  container.querySelector('#dict-hint').disabled = true;
  const nextBtn = container.querySelector('#dict-next');
  nextBtn.hidden = false;
  nextBtn.focus();
}

function next() {
  audio.playClick();
  audio.stopSpeech();
  queue.resolve(lastCorrect);
  renderItem();
}

function onGapKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (checked) {
      next();
      return;
    }
    // Enter в незаполненном пропуске — переход к следующему, в последнем — проверка
    const pos = gaps.findIndex((g) => g.input === e.currentTarget);
    const nextEmpty = gaps.slice(pos + 1).find((g) => !g.input.value.trim());
    if (nextEmpty && e.currentTarget.value.trim()) nextEmpty.input.focus();
    else check();
  }
}

function onKeyDown(e) {
  if (!container || isModalOpen() || !queue || queue.done) return;
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    listen();
    return;
  }
  if (e.key === 'Enter' && checked && !isOwnButton(e) && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault();
    next();
  }
}

export function mountDictation(target, unitData) {
  container = target;
  unit = unitData;
  if (!getDictationItems(unit, 'sentences').length && !getDictationItems(unit, 'text').length) {
    container.innerHTML = emptyState('🎧', 'В этом уроке нет фраз для диктанта');
    return;
  }
  if (!getDictationItems(unit, settings.source).length) {
    settings.source = settings.source === 'text' ? 'sentences' : 'text';
  }
  window.addEventListener('keydown', onKeyDown);
  start();
}

export function destroyDictation() {
  window.removeEventListener('keydown', onKeyDown);
  audio.stopSpeech();
  container = null;
  unit = null;
  lastFocused = null;
}
