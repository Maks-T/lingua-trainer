import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { getMatchWords } from '../core/exercises.js';
import { escapeHtml, shuffle, exerciseHeader, finishScreen, emptyState, isModalOpen, isTypingTarget } from '../core/utils.js';

const ROUND_SIZE = 6;
const SETTINGS_KEY = 'lingua_match_side';

let container = null;
let unit = null;
let rounds = [];
let roundIndex = 0;
let selected = null; // { side: 'left' | 'right', id }
let matched = new Set();
let missed = new Set();
let firstTryCorrect = 0;
let total = 0;
let side = loadSide(); // 'ru' | 'definition'
let busy = false;

function loadSide() {
  try {
    return localStorage.getItem(SETTINGS_KEY) === 'definition' ? 'definition' : 'ru';
  } catch {
    return 'ru';
  }
}

function hasDefinitions() {
  return getMatchWords(unit).filter((w) => w.definition).length >= ROUND_SIZE;
}

function rightText(word) {
  return side === 'definition' && word.definition ? word.definition : word.ru;
}

function start() {
  const words = shuffle(getMatchWords(unit)).filter((w) => side !== 'definition' || w.definition);
  rounds = [];
  for (let i = 0; i < words.length; i += ROUND_SIZE) rounds.push(words.slice(i, i + ROUND_SIZE));
  // Короткий последний раунд добираем словами из предыдущего, чтобы было из чего выбирать
  const last = rounds[rounds.length - 1];
  if (rounds.length > 1 && last.length < 3) {
    rounds[rounds.length - 2].push(...rounds.pop());
  }
  total = words.length;
  roundIndex = 0;
  firstTryCorrect = 0;
  missed = new Set();
  renderRound();
}

function renderFinish() {
  audio.playWin();
  container.innerHTML = finishScreen({
    icon: '🔗',
    title: 'Все пары найдены!',
    correct: firstTryCorrect,
    total,
    restartId: 'match-restart',
  });
  container.querySelector('#match-restart')?.addEventListener('click', start);
}

function card(word, which) {
  const text = which === 'left' ? word.target : rightText(word);
  const extra = which === 'left' && word.transcript ? `<small>${escapeHtml(word.transcript)}</small>` : '';
  return `<button type="button" class="match-card${which === 'right' && side === 'definition' ? ' is-definition' : ''}" data-side="${which}" data-id="${escapeHtml(word.id)}"><span>${escapeHtml(text)}</span>${extra}</button>`;
}

function renderRound() {
  if (!container) return;
  if (roundIndex >= rounds.length) {
    renderFinish();
    return;
  }

  const words = rounds[roundIndex];
  matched = new Set();
  selected = null;
  busy = false;
  const doneBefore = rounds.slice(0, roundIndex).reduce((n, r) => n + r.length, 0);

  container.innerHTML = `
    <div class="exercise">
      ${exerciseHeader(`Раунд ${roundIndex + 1} из ${rounds.length}`, doneBefore, total)}
      <div class="prompt">
        <h1 class="prompt-title" style="font-size:1.35rem">Соедините слово с ${side === 'definition' ? 'определением' : 'переводом'}</h1>
        <div class="prompt-hint">Нажмите на карточку слева, затем на подходящую справа (или наоборот).</div>
      </div>
      ${
        hasDefinitions()
          ? `<div class="segmented" role="group" aria-label="Что сопоставлять">
              <button type="button" data-side-mode="ru" class="${side === 'ru' ? 'active' : ''}">Перевод</button>
              <button type="button" data-side-mode="definition" class="${side === 'definition' ? 'active' : ''}">Определение (EN)</button>
            </div>`
          : ''
      }
      <div class="match-grid">
        <div class="match-col" lang="${escapeHtml(unit.lang)}">${shuffle(words).map((w) => card(w, 'left')).join('')}</div>
        <div class="match-col"${side === 'definition' ? ` lang="${escapeHtml(unit.lang)}"` : ''}>${shuffle(words).map((w) => card(w, 'right')).join('')}</div>
      </div>
    </div>
  `;

  container.querySelectorAll('.match-card').forEach((btn) => btn.addEventListener('click', () => pick(btn)));
  container.querySelectorAll('[data-side-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (side === btn.dataset.sideMode) return;
      side = btn.dataset.sideMode;
      try {
        localStorage.setItem(SETTINGS_KEY, side);
      } catch {
        /* ignore */
      }
      audio.playClick();
      start();
    })
  );
}

function cardEl(which, id) {
  return container?.querySelector(`.match-card[data-side="${which}"][data-id="${CSS.escape(id)}"]`);
}

function pick(btn) {
  if (busy || btn.classList.contains('done')) return;
  const which = btn.dataset.side;
  const id = btn.dataset.id;
  const word = rounds[roundIndex].find((w) => w.id === id);

  if (which === 'left') {
    audio.playSpeech(word.audio, null, null, word.target, unit.lang);
  } else {
    audio.playClick();
  }

  if (!selected || selected.side === which) {
    container.querySelectorAll('.match-card.selected').forEach((c) => c.classList.remove('selected'));
    selected = { side: which, id };
    btn.classList.add('selected');
    return;
  }

  const leftId = which === 'left' ? id : selected.id;
  const rightId = which === 'right' ? id : selected.id;
  const leftEl = cardEl('left', leftId);
  const rightEl = cardEl('right', rightId);
  selected = null;

  if (leftId === rightId) {
    leftEl.classList.remove('selected');
    rightEl.classList.remove('selected');
    leftEl.classList.add('done');
    rightEl.classList.add('done');
    matched.add(leftId);
    if (!missed.has(leftId)) {
      firstTryCorrect += 1;
      state.recordAnswer(unit.id, true, `match:${leftId}`);
    }
    audio.playSuccess();
    if (matched.size === rounds[roundIndex].length) {
      busy = true;
      setTimeout(() => {
        roundIndex += 1;
        renderRound();
      }, 700);
    }
  } else {
    // Ошибка засчитывается слову слева один раз за серию
    if (!missed.has(leftId)) {
      missed.add(leftId);
      state.recordAnswer(unit.id, false);
    }
    audio.playMistake();
    busy = true;
    [leftEl, rightEl].forEach((el) => {
      el.classList.remove('selected');
      el.classList.add('wrong');
    });
    setTimeout(() => {
      leftEl?.classList.remove('wrong');
      rightEl?.classList.remove('wrong');
      busy = false;
    }, 500);
  }
}

function onKeyDown(e) {
  if (!container || isModalOpen() || isTypingTarget(e.target)) return;
  if (e.key === 'Escape' && selected) {
    container.querySelectorAll('.match-card.selected').forEach((c) => c.classList.remove('selected'));
    selected = null;
  }
}

export function mountMatch(target, unitData) {
  container = target;
  unit = unitData;
  if (getMatchWords(unit).length < 3) {
    container.innerHTML = emptyState('🔗', 'Для пар нужно хотя бы 3 слова с переводом', 'Добавьте переводы к словам урока.');
    return;
  }
  if (side === 'definition' && !hasDefinitions()) side = 'ru';
  window.addEventListener('keydown', onKeyDown);
  start();
}

export function destroyMatch() {
  window.removeEventListener('keydown', onKeyDown);
  audio.stopSpeech();
  container = null;
  unit = null;
}
