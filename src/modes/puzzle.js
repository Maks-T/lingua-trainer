import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { createBoard } from '../core/board.js';
import { createQueue, queueHeader, queueFinish } from '../core/queue.js';
import {
  escapeHtml,
  shuffle,
  normalizePhrase,
  normalizeWord,
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

function colorClass(text) {
  const clean = normalizeWord(text);
  for (const group of unit?.colors || []) {
    if (group.words.some((w) => normalizeWord(w) === clean)) return `color-${group.color}`;
  }
  return '';
}

function parseDistractors(q) {
  if (Array.isArray(q.distractorWords)) return q.distractorWords;
  if (typeof q.distractorWords === 'string') return q.distractorWords.split(/[\s/]+/).filter(Boolean);
  return [];
}

function start() {
  queue = createQueue(shuffle(unit.sentences || []));
  renderQuestion();
}

function renderFinish() {
  audio.playWin();
  container.innerHTML = queueFinish({ title: 'Все предложения собраны!', q: queue, restartId: 'puzzle-restart' });
  container.querySelector('#puzzle-restart')?.addEventListener('click', start);
}

function renderQuestion() {
  if (!container) return;
  if (queue.done) {
    renderFinish();
    return;
  }

  const q = queue.current;
  checked = false;
  const targetWords = (q.target || '').split(/\s+/).filter(Boolean);
  const distractors = parseDistractors(q).filter(
    (d) => !targetWords.some((t) => normalizeWord(t) === normalizeWord(d))
  );
  const items = shuffle([...targetWords, ...distractors]).map((text, i) => ({ id: `w${i}`, text }));

  container.innerHTML = `
    <div class="exercise">
      ${queueHeader('Соберите предложение', queue)}
      <div class="prompt">
        <h1 class="prompt-title">${escapeHtml(q.ru || 'Соберите услышанную фразу')}</h1>
        ${q.transcript ? `<div class="prompt-sub">${escapeHtml(q.transcript)}</div>` : ''}
      </div>
      ${listenButton('puzzle-listen')}
      <div class="drop-zone" id="puzzle-zone" aria-label="Зона сборки предложения"></div>
      <div class="word-bank" id="puzzle-bank" aria-label="Слова"></div>
      <div class="feedback" id="puzzle-feedback" role="status"></div>
      <div class="controls">
        <button type="button" class="btn btn-secondary" id="puzzle-clear">${ICONS.trash}Очистить</button>
        <div class="controls-right">
          <button type="button" class="btn btn-primary" id="puzzle-check" disabled>Проверить ${ICONS.arrow}</button>
          <button type="button" class="btn btn-primary" id="puzzle-next" hidden>Далее ${ICONS.arrow}</button>
        </div>
      </div>
    </div>
  `;

  const checkBtn = container.querySelector('#puzzle-check');
  board = createBoard({
    zoneEl: container.querySelector('#puzzle-zone'),
    bankEl: container.querySelector('#puzzle-bank'),
    items,
    chipClass: (item) => colorClass(item.text),
    placeholderHtml: `
      <div class="drop-placeholder">
        ${ICONS.puzzle}
        <span>Нажимайте на слова или перетащите их сюда,<br>чтобы составить предложение</span>
      </div>`,
    onChange: () => {
      checkBtn.disabled = board.selected.length === 0;
    },
  });

  container.querySelector('#puzzle-listen').addEventListener('click', listen);
  container.querySelector('#puzzle-clear').addEventListener('click', () => board.clear());
  checkBtn.addEventListener('click', check);
  container.querySelector('#puzzle-next').addEventListener('click', next);
  if (!q.ru) setTimeout(() => container && queue?.current === q && listen(), 300);
}

function listen() {
  if (!container || !unit) return;
  const q = queue?.current;
  if (!q) return;
  playWithButton(audio, container?.querySelector('#puzzle-listen'), q.audio, q.target, unit.lang);
}

function check() {
  if (checked || !board?.selected.length) return;
  const q = queue.current;
  const assembled = board.selected.map((w) => w.text).join(' ');
  const isCorrect = normalizePhrase(assembled) === normalizePhrase(q.target);
  checked = true;

  state.recordAnswer(unit.id, isCorrect, `puzzle:${q.id}`);
  lastCorrect = isCorrect;

  board.lock();
  board.setZoneState(isCorrect ? 'success' : 'error');
  const feedback = container.querySelector('#puzzle-feedback');
  if (isCorrect) {
    audio.playSuccess();
    showFeedback(feedback, 'success', 'Правильно!', escapeHtml(q.target));
  } else {
    audio.playMistake();
    showFeedback(feedback, 'error', `Правильно: <strong>${escapeHtml(q.target)}</strong>`, `Ваш ответ: ${escapeHtml(assembled)} · 🔁 это предложение вернётся позже`);
  }

  container.querySelector('#puzzle-check').hidden = true;
  container.querySelector('#puzzle-clear').disabled = true;
  const nextBtn = container.querySelector('#puzzle-next');
  nextBtn.hidden = false;
  nextBtn.focus();
  setTimeout(listen, 350);
}

function next() {
  audio.playClick();
  audio.stopSpeech();
  queue.resolve(lastCorrect);
  renderQuestion();
}

function onKeyDown(e) {
  if (!container || isModalOpen() || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!queue || queue.done) return;
  if (e.key === 'Enter') {
    // Enter на сфокусированной кнопке сработает как клик — не дублируем
    if (isOwnButton(e)) return;
    e.preventDefault();
    if (checked) next();
    else check();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    board?.pop();
  } else if (e.key === ' ' && !isOwnButton(e)) {
    e.preventDefault();
    listen();
  }
}

export function mountPuzzle(target, unitData) {
  container = target;
  unit = unitData;
  if (!unit?.sentences?.length) {
    container.innerHTML = emptyState('🧩', 'В этом уроке нет предложений для пазла', 'Попробуйте другие режимы.');
    return;
  }
  window.addEventListener('keydown', onKeyDown);
  start();
}

export function destroyPuzzle() {
  window.removeEventListener('keydown', onKeyDown);
  audio.stopSpeech();
  container = null;
  unit = null;
  board = null;
}
