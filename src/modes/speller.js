import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { createBoard } from '../core/board.js';
import { createQueue, queueHeader, queueFinish } from '../core/queue.js';
import {
  escapeHtml,
  shuffle,
  isTypingTarget,
  isModalOpen,
  listenButton,
  playWithButton,
  showFeedback,
  emptyState,
  ICONS,
} from '../core/utils.js';

let container = null;

/** Enter/Пробел на кнопке внутри упражнения сработает как клик — не дублируем. */
const isOwnButton = (e) => e.target instanceof HTMLButtonElement && Boolean(container?.contains(e.target));
let unit = null;
let queue = null;
let lastCorrect = false;
let board = null;
let checked = false;
let targetLetters = [];

const compact = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

function parseDistractors(q) {
  if (typeof q.distractorLetters === 'string') return q.distractorLetters.replace(/\s+/g, '').split('');
  if (Array.isArray(q.distractorLetters)) return q.distractorLetters;
  return [];
}

function start() {
  queue = createQueue(shuffle(unit.words || []));
  renderWord();
}

function renderFinish() {
  audio.playWin();
  container.innerHTML = queueFinish({ title: 'Все слова собраны!', q: queue, restartId: 'speller-restart' });
  container.querySelector('#speller-restart')?.addEventListener('click', start);
}

function renderWord() {
  if (!container) return;
  if (queue.done) {
    renderFinish();
    return;
  }

  const q = queue.current;
  checked = false;
  // Пробелы в многословных словах (напр. «von Beruf») не собираются — сравниваем без них
  targetLetters = [...String(q.target || '').replace(/\s+/g, '')];
  const items = shuffle([...targetLetters, ...parseDistractors(q)]).map((text, i) => ({ id: `l${i}`, text }));

  container.innerHTML = `
    <div class="exercise">
      ${queueHeader('Соберите слово по буквам', queue)}
      <div class="prompt">
        <h1 class="prompt-title">${escapeHtml(q.ru || 'Соберите услышанное слово')}</h1>
        ${q.transcript ? `<div class="prompt-sub">${escapeHtml(q.transcript)}</div>` : ''}
        ${q.definition ? `<div class="prompt-hint" lang="${escapeHtml(unit.lang)}">💬 ${escapeHtml(q.definition)}</div>` : ''}
        <div class="prompt-hint">Букв в слове: ${targetLetters.length}</div>
      </div>
      ${listenButton('speller-listen')}
      <div class="drop-zone" id="speller-zone" aria-label="Собранное слово"></div>
      <div class="word-bank" id="speller-bank" aria-label="Буквы"></div>
      <div class="feedback" id="speller-feedback" role="status"></div>
      <div class="controls">
        <button type="button" class="btn btn-secondary" id="speller-clear">${ICONS.trash}Очистить</button>
        <div class="controls-right">
          <button type="button" class="btn btn-primary" id="speller-check" disabled>Проверить ${ICONS.arrow}</button>
          <button type="button" class="btn btn-primary" id="speller-next" hidden>Далее ${ICONS.arrow}</button>
        </div>
      </div>
    </div>
  `;

  const checkBtn = container.querySelector('#speller-check');
  board = createBoard({
    zoneEl: container.querySelector('#speller-zone'),
    bankEl: container.querySelector('#speller-bank'),
    items,
    chipClass: () => 'letter',
    slots: targetLetters.length,
    onChange: () => {
      checkBtn.disabled = board.selected.length === 0;
    },
  });

  container.querySelector('#speller-listen').addEventListener('click', listen);
  container.querySelector('#speller-clear').addEventListener('click', () => board.clear());
  checkBtn.addEventListener('click', check);
  container.querySelector('#speller-next').addEventListener('click', next);
  if (!q.ru) setTimeout(() => container && queue?.current === q && listen(), 300);
}

function listen() {
  if (!container || !unit) return;
  const q = queue?.current;
  if (!q) return;
  playWithButton(audio, container?.querySelector('#speller-listen'), q.audio, q.target, unit.lang);
}

function check() {
  if (checked || !board?.selected.length) return;
  const q = queue.current;
  const assembled = board.selected.map((l) => l.text).join('');
  const isCorrect = compact(assembled) === compact(q.target);
  checked = true;

  state.recordAnswer(unit.id, isCorrect, `speller:${q.id}`);
  lastCorrect = isCorrect;

  board.lock();
  board.setZoneState(isCorrect ? 'success' : 'error');
  const feedback = container.querySelector('#speller-feedback');
  if (isCorrect) {
    audio.playSuccess();
    showFeedback(feedback, 'success', 'Верно!', escapeHtml(q.target));
  } else {
    audio.playMistake();
    showFeedback(feedback, 'error', `Правильное написание: <strong>${escapeHtml(q.target)}</strong>`, `Ваш вариант: ${escapeHtml(assembled)} · 🔁 слово вернётся позже`);
  }

  container.querySelector('#speller-check').hidden = true;
  container.querySelector('#speller-clear').disabled = true;
  const nextBtn = container.querySelector('#speller-next');
  nextBtn.hidden = false;
  nextBtn.focus();
  setTimeout(listen, 350);
}

function next() {
  audio.playClick();
  audio.stopSpeech();
  queue.resolve(lastCorrect);
  renderWord();
}

function onKeyDown(e) {
  // Не перехватываем клавиши в полях ввода (например, в окне настроек)
  if (!container || isModalOpen() || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!queue || queue.done) return;

  if (e.key === 'Enter') {
    if (isOwnButton(e)) return;
    e.preventDefault();
    if (checked) next();
    else check();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    board?.pop();
  } else if (e.key === ' ') {
    if (isOwnButton(e)) return;
    e.preventDefault();
    listen();
  } else if (!checked && e.key.length === 1 && /\p{L}|['’-]/u.test(e.key)) {
    e.preventDefault();
    if (board?.takeByText(e.key) && board.selected.length === targetLetters.length) {
      container.querySelector('#speller-check')?.focus();
    }
  }
}

export function mountSpeller(target, unitData) {
  container = target;
  unit = unitData;
  if (!unit?.words?.length) {
    container.innerHTML = emptyState('🔤', 'В этом уроке нет слов для спеллера', 'Попробуйте другие режимы.');
    return;
  }
  window.addEventListener('keydown', onKeyDown);
  start();
}

export function destroySpeller() {
  window.removeEventListener('keydown', onKeyDown);
  audio.stopSpeech();
  container = null;
  unit = null;
  board = null;
}
