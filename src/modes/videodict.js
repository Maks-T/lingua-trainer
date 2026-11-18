/**
 * Видео-диктант: фразы из субтитров оригинального видео.
 * Свободный режим — можно выбирать любую фразу, перематывать видео; на прогресс урока не влияет.
 */
import { audio } from '../core/audio.js';
import { parseSubtitles, buildSentences, formatTime } from '../core/captions.js';
import { createSegmentPlayer } from '../core/youtube.js';
import { GAP_LEVELS, SPECIAL_KEYS, pickGapIndices, gradeGap, insertIntoInput } from '../core/gaps.js';
import { escapeHtml, tokenize, normalizeWord, getUnitVideo, showFeedback, emptyState, isModalOpen, toast, ICONS } from '../core/utils.js';

const LEVEL_KEY = 'lingua_vdict_level';
const statusKey = (unitId) => `lingua_vdict_status_${unitId}`;
const posKey = (unitId) => `lingua_vdict_pos_${unitId}`;
const customCaptionsKey = (unitId) => `lingua_vdict_captions_${unitId}`;

let container = null;
let unit = null;
let video = null;
let sentences = [];
let index = 0;
let level = readLS(LEVEL_KEY) || 'easy';
let statuses = {}; // id -> 'ok' | 'wrong'
let player = null;
let gaps = [];
let checked = false;
let lastFocused = null;
let mountToken = 0;

function readLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* переполнено или приватный режим */
  }
}

async function loadCaptionsText() {
  const custom = readLS(customCaptionsKey(unit.id));
  if (custom) return custom;
  const url = unit.video?.captions;
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Субтитры не найдены (${res.status})`);
  return res.text();
}

/* ---------------------------------------------------------
   Разметка
   --------------------------------------------------------- */
function renderShell() {
  const credit = unit.video?.captionsCredit;
  container.innerHTML = `
    <div class="exercise vdict">
      <div class="exercise-head">
        <span class="exercise-kicker">Видео-диктант <span class="free-badge">свободный режим</span></span>
        <span class="exercise-counter" id="vd-counter"></span>
      </div>
      <div class="vd-player-wrap"><div id="vd-player"></div></div>
      <div class="vd-toolbar">
        <div class="segmented" role="group" aria-label="Сложность">
          ${Object.entries(GAP_LEVELS)
            .map(([key, meta]) => `<button type="button" data-level="${key}" class="${level === key ? 'active' : ''}">${meta.label}</button>`)
            .join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-small" id="vd-here" title="Выбрать фразу, которая звучит в текущем месте видео">📍 Фраза в этом месте видео</button>
      </div>
      <div id="vd-task"></div>
      <details class="vd-list-wrap" id="vd-list-wrap">
        <summary>Все фразы видео <span class="muted" id="vd-list-summary"></span></summary>
        <div class="vd-list" id="vd-list"></div>
        <div class="vd-list-actions">
          <button type="button" class="btn-link" id="vd-reset">Сбросить отметки</button>
          <label class="btn-link vd-upload">Загрузить другие субтитры (.vtt/.srt)<input type="file" accept=".vtt,.srt,text/vtt" hidden id="vd-upload-input" /></label>
          ${readLS(customCaptionsKey(unit.id)) ? '<button type="button" class="btn-link" id="vd-reset-captions">Вернуть субтитры урока</button>' : ''}
        </div>
        ${credit ? `<p class="muted vd-credit">${escapeHtml(credit)}</p>` : ''}
      </details>
    </div>
  `;

  container.querySelectorAll('[data-level]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (level === btn.dataset.level) return;
      level = btn.dataset.level;
      writeLS(LEVEL_KEY, level);
      container.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('active', b === btn));
      audio.playClick();
      renderTask(false);
    })
  );
  container.querySelector('#vd-here').addEventListener('click', jumpToVideoPosition);
  container.querySelector('#vd-reset').addEventListener('click', () => {
    statuses = {};
    writeLS(statusKey(unit.id), null);
    renderList();
    renderCounter();
  });
  container.querySelector('#vd-reset-captions')?.addEventListener('click', () => {
    writeLS(customCaptionsKey(unit.id), null);
    mountVideoDictation(container, unit);
  });
  container.querySelector('#vd-upload-input').addEventListener('change', onUploadCaptions);
}

function renderCounter() {
  const el = container?.querySelector('#vd-counter');
  if (!el) return;
  const ok = Object.values(statuses).filter((s) => s === 'ok').length;
  const wrong = Object.values(statuses).filter((s) => s === 'wrong').length;
  el.innerHTML = `фраза <strong>${index + 1}</strong> из ${sentences.length}
    <span class="counter-sep">·</span> <span class="text-success">✓ ${ok}</span>
    <span class="counter-sep">·</span> <span class="text-danger">✕ ${wrong}</span>`;
  const summary = container.querySelector('#vd-list-summary');
  if (summary) summary.textContent = `(${sentences.length}, решено ${ok})`;
}

function renderList() {
  const list = container?.querySelector('#vd-list');
  if (!list) return;
  list.innerHTML = sentences
    .map((s, i) => {
      const st = statuses[s.id];
      const icon = st === 'ok' ? '✓' : st === 'wrong' ? '✕' : '';
      // Текст нерешённых фраз скрыт, чтобы список не подсказывал ответ
      const text = st ? escapeHtml(s.text) : `${s.text.split(' ').length} слов`;
      return `<button type="button" class="vd-item${i === index ? ' active' : ''}${st ? ` st-${st}` : ''}" data-i="${i}">
        <span class="vd-time">${formatTime(s.start)}</span>
        <span class="vd-text">${text}</span>
        <span class="vd-status">${icon}</span>
      </button>`;
    })
    .join('');
  list.querySelectorAll('.vd-item').forEach((btn) =>
    btn.addEventListener('click', () => {
      goTo(Number(btn.dataset.i), true);
    })
  );
  list.querySelector('.vd-item.active')?.scrollIntoView({ block: 'nearest' });
}

function renderTask(autoplay = true) {
  const task = container?.querySelector('#vd-task');
  if (!task) return;
  const s = sentences[index];
  checked = false;
  const tokens = tokenize(s.text);
  const gapIdx = new Set(pickGapIndices(tokens, level, unit.words));
  gaps = [];
  const textHtml = tokens
    .map((tok, i) => {
      if (!gapIdx.has(i)) return escapeHtml(tok.text);
      const n = gaps.length;
      gaps.push({ answer: tok.text, input: null });
      return `<input class="gap-input" data-gap="${n}" style="width:${Math.max(3, tok.text.length + 1.5)}ch" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Пропуск ${n + 1}" />`;
    })
    .join('');
  const specials = SPECIAL_KEYS[unit.lang] || [];

  task.innerHTML = `
    <div class="listen-row">
      <button type="button" class="listen-btn" id="vd-play"><span class="listen-icon">${ICONS.play}</span><span class="listen-label"><strong>Фрагмент</strong><small>Ctrl + Пробел · ${formatTime(s.start)}</small></span></button>
      <button type="button" class="listen-btn" id="vd-slow"><span class="listen-icon">${ICONS.play}</span><span class="listen-label"><strong>Медленно</strong><small>0.75×</small></span></button>
      <div class="vd-nav">
        <button type="button" class="icon-btn" id="vd-prev" title="Предыдущая фраза (Alt + ←)" ${index === 0 ? 'disabled' : ''}>‹</button>
        <button type="button" class="icon-btn" id="vd-next-nav" title="Следующая фраза (Alt + →)" ${index >= sentences.length - 1 ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <div class="dictation-text" lang="${escapeHtml(unit.lang)}">${textHtml}</div>
    ${specials.length ? `<div class="special-keys">${specials.map((c) => `<button type="button" data-char="${c}">${c}</button>`).join('')}</div>` : ''}
    <div class="feedback" id="vd-feedback" role="status"></div>
    <div class="controls">
      <button type="button" class="btn btn-secondary" id="vd-hint">💡 Подсказка</button>
      <div class="controls-right">
        <button type="button" class="btn btn-ghost" id="vd-giveup">Показать ответ</button>
        <button type="button" class="btn btn-primary" id="vd-check">Проверить ${ICONS.arrow}</button>
        <button type="button" class="btn btn-primary" id="vd-next" hidden>Дальше ${ICONS.arrow}</button>
      </div>
    </div>
  `;

  task.querySelectorAll('.gap-input').forEach((input) => {
    gaps[Number(input.dataset.gap)].input = input;
    input.addEventListener('focus', () => {
      lastFocused = input;
    });
    input.addEventListener('keydown', onGapKeyDown);
  });
  task.querySelector('#vd-play').addEventListener('click', () => playCurrent());
  task.querySelector('#vd-slow').addEventListener('click', () => playCurrent(0.75));
  task.querySelector('#vd-prev').addEventListener('click', () => goTo(index - 1, true));
  task.querySelector('#vd-next-nav').addEventListener('click', () => goTo(index + 1, true));
  task.querySelectorAll('.special-keys button').forEach((btn) =>
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertIntoInput(lastFocused || gaps.find((g) => !g.input.readOnly)?.input, btn.dataset.char);
    })
  );
  task.querySelector('#vd-hint').addEventListener('click', hint);
  task.querySelector('#vd-giveup').addEventListener('click', () => check(true));
  task.querySelector('#vd-check').addEventListener('click', () => check(false));
  task.querySelector('#vd-next').addEventListener('click', () => goTo(index + 1, true));

  lastFocused = gaps[0]?.input || null;
  gaps[0]?.input?.focus({ preventScroll: true });
  renderCounter();
  renderList();
  writeLS(posKey(unit.id), String(index));
  if (autoplay) playCurrent();
}

/* ---------------------------------------------------------
   Действия
   --------------------------------------------------------- */
function playCurrent(rate = 1) {
  const s = sentences[index];
  if (!s || !player) return;
  audio.stopSpeech();
  player.playSegment(s.start, s.end, rate);
}

function goTo(i, autoplay) {
  if (i < 0 || i >= sentences.length) {
    if (i >= sentences.length) toast('Это была последняя фраза видео 🎉', 'success');
    return;
  }
  index = i;
  audio.playClick();
  renderTask(autoplay);
}

function jumpToVideoPosition() {
  if (!player) return;
  const t = player.currentTime();
  let found = sentences.findIndex((s) => t >= s.start && t <= s.end);
  if (found === -1) {
    // Между фразами — берём ближайшую следующую
    found = sentences.findIndex((s) => s.start > t);
    if (found === -1) found = sentences.length - 1;
  }
  player.pause();
  goTo(found, true);
}

function hint() {
  if (checked) return;
  const target =
    (lastFocused && gaps.find((g) => g.input === lastFocused)) ||
    gaps.find((g) => normalizeWord(g.input.value) !== normalizeWord(g.answer));
  if (!target) return;
  const typed = target.input.value;
  let common = 0;
  while (common < typed.length && common < target.answer.length && typed[common].toLowerCase() === target.answer[common].toLowerCase()) {
    common += 1;
  }
  target.input.value = target.answer.slice(0, Math.min(target.answer.length, common + 1));
  target.input.focus();
  audio.playClick();
}

function check(giveUp) {
  if (checked) return;
  checked = true;
  const s = sentences[index];
  let ok = 0;
  gaps.forEach((gap) => {
    const grade = giveUp ? 'wrong' : gradeGap(gap.input.value, gap.answer, unit.lang);
    gap.input.readOnly = true;
    gap.input.classList.add(grade);
    if (grade === 'correct') {
      ok += 1;
      gap.input.value = gap.answer;
    } else {
      gap.input.insertAdjacentHTML('afterend', `<span class="gap-fix">${escapeHtml(gap.answer)}</span>`);
    }
  });
  const allOk = ok === gaps.length;
  // «Верно» не перезаписываем ошибкой при повторном прохождении
  if (allOk) statuses[s.id] = 'ok';
  else if (statuses[s.id] !== 'ok') statuses[s.id] = 'wrong';
  writeLS(statusKey(unit.id), JSON.stringify(statuses));

  const feedback = container.querySelector('#vd-feedback');
  if (allOk) {
    audio.playSuccess();
    showFeedback(feedback, 'success', 'Верно!', escapeHtml(s.text));
  } else {
    audio.playMistake();
    showFeedback(feedback, giveUp ? 'warning' : 'error', giveUp ? 'Ответ' : `Верно ${ok} из ${gaps.length}`, escapeHtml(s.text));
  }
  container.querySelector('#vd-check').hidden = true;
  container.querySelector('#vd-giveup').hidden = true;
  container.querySelector('#vd-hint').disabled = true;
  const nextBtn = container.querySelector('#vd-next');
  nextBtn.hidden = false;
  nextBtn.focus({ preventScroll: true });
  renderCounter();
  renderList();
}

function onGapKeyDown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.stopPropagation();
  if (checked) {
    goTo(index + 1, true);
    return;
  }
  const pos = gaps.findIndex((g) => g.input === e.currentTarget);
  const nextEmpty = gaps.slice(pos + 1).find((g) => !g.input.value.trim());
  if (nextEmpty && e.currentTarget.value.trim()) nextEmpty.input.focus();
  else check(false);
}

function onKeyDown(e) {
  if (!container || isModalOpen()) return;
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    playCurrent();
  } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    goTo(index + (e.key === 'ArrowRight' ? 1 : -1), true);
  } else if (e.key === 'Enter' && checked && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault();
    goTo(index + 1, true);
  }
}

async function onUploadCaptions(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = buildSentences(parseSubtitles(text));
  if (!parsed.length) {
    toast('В файле не найдено субтитров', 'error');
    return;
  }
  writeLS(customCaptionsKey(unit.id), text);
  writeLS(statusKey(unit.id), null);
  writeLS(posKey(unit.id), null);
  toast(`Загружено фраз: ${parsed.length}`, 'success');
  mountVideoDictation(container, unit);
}

/* ---------------------------------------------------------
   Монтирование
   --------------------------------------------------------- */
function renderNoCaptions() {
  container.innerHTML = `
    ${emptyState(
      '🎬',
      'Для видео-диктанта нужны субтитры',
      'Скачайте субтитры к видео в формате <strong>.vtt</strong> или <strong>.srt</strong> (например, через DownSub) и загрузите их — фразы соберутся автоматически.'
    )}
    <div style="display:flex; justify-content:center; margin-top:-80px">
      <label class="btn btn-primary">Загрузить субтитры<input type="file" accept=".vtt,.srt,text/vtt" hidden id="vd-upload-input" /></label>
    </div>
  `;
  container.querySelector('#vd-upload-input').addEventListener('change', onUploadCaptions);
}

export async function mountVideoDictation(target, unitData) {
  destroyVideoDictation();
  const token = ++mountToken;
  container = target;
  unit = unitData;
  video = getUnitVideo(unit);

  if (!video) {
    container.innerHTML = emptyState('🎬', 'У этого урока нет видео', 'Видео-диктант доступен для уроков со ссылкой на YouTube.');
    return;
  }

  container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div><p>Готовлю фразы из субтитров…</p></div>';
  let text;
  try {
    text = await loadCaptionsText();
  } catch (err) {
    if (token !== mountToken) return;
    container.innerHTML = emptyState('⚠️', 'Не удалось загрузить субтитры', escapeHtml(err.message));
    return;
  }
  if (token !== mountToken) return;
  sentences = text ? buildSentences(parseSubtitles(text)) : [];
  if (!sentences.length) {
    renderNoCaptions();
    return;
  }

  try {
    statuses = JSON.parse(readLS(statusKey(unit.id))) || {};
  } catch {
    statuses = {};
  }
  index = Math.min(Number(readLS(posKey(unit.id))) || 0, sentences.length - 1);

  renderShell();
  window.addEventListener('keydown', onKeyDown);
  renderTask(false);

  try {
    const p = await createSegmentPlayer(container.querySelector('#vd-player'), video);
    if (token !== mountToken) {
      p.destroy();
      return;
    }
    player = p;
  } catch (err) {
    if (token !== mountToken) return;
    const wrap = container.querySelector('.vd-player-wrap');
    if (wrap) wrap.innerHTML = `<div class="vd-player-error">⚠️ ${escapeHtml(err.message)}</div>`;
  }
}

export function destroyVideoDictation() {
  mountToken += 1;
  window.removeEventListener('keydown', onKeyDown);
  player?.destroy();
  player = null;
  container = null;
  unit = null;
  lastFocused = null;
}
