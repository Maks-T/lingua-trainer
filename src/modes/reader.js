import { audio } from '../core/audio.js';
import { escapeHtml, tokenize, normalizeWord, emptyState, ICONS, getUnitVideo } from '../core/utils.js';
import { openVideoModal } from '../core/video.js';

let container = null;
let unit = null;
let isPlayingAll = false;
let popover = null;
let popoverTimer = null;

function findWord(raw) {
  const clean = normalizeWord(raw);
  const words = unit?.words || [];
  return (
    words.find((w) => normalizeWord(w.target) === clean) ||
    // «heiße» → «heißen», «kommst» → «kommen»: совпадение по основе
    words.find((w) => {
      const base = normalizeWord(w.target);
      const stem = base.length > 5 ? base.slice(0, base.length - 2) : base;
      return stem.length >= 4 && clean.startsWith(stem);
    }) ||
    null
  );
}

function setActiveRow(index) {
  container?.querySelectorAll('.reader-row').forEach((r, i) => r.classList.toggle('active', i === index));
}

function setPlayAllLabel() {
  const btn = container?.querySelector('#reader-play-all');
  if (btn) btn.innerHTML = isPlayingAll ? `${ICONS.stop} Остановить` : `${ICONS.play} Слушать весь текст`;
}

function stopPlayback() {
  isPlayingAll = false;
  audio.stopSpeech();
  setActiveRow(-1);
  setPlayAllLabel();
}

function playParagraph(index, onComplete = null) {
  const item = unit?.text?.[index];
  if (!item) return;
  setActiveRow(index);
  container?.querySelectorAll('.reader-row')[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  audio.playSpeech(
    item.audio,
    null,
    (err) => {
      if (!isPlayingAll && err?.message !== 'stopped') setActiveRow(-1);
      onComplete?.(err);
    },
    item.target,
    unit.lang
  );
}

function playAll(startIndex = 0) {
  isPlayingAll = true;
  setPlayAllLabel();
  const step = (idx) => {
    if (!isPlayingAll || !container) return;
    if (idx >= (unit?.text?.length || 0)) {
      stopPlayback();
      return;
    }
    playParagraph(idx, (err) => {
      if (err?.message === 'stopped') return;
      setTimeout(() => step(idx + 1), 350);
    });
  };
  step(startIndex);
}

function hidePopover() {
  clearTimeout(popoverTimer);
  popover?.remove();
  popover = null;
}

function showPopover(span, word, match) {
  hidePopover();
  popover = document.createElement('div');
  popover.className = 'word-popover';
  popover.innerHTML = match
    ? `<strong>${escapeHtml(match.target)}</strong>${match.transcript ? `${escapeHtml(match.transcript)}<br>` : ''}${escapeHtml(match.ru)}${
        match.definition ? `<br><em style="opacity:.75">${escapeHtml(match.definition)}</em>` : ''
      }`
    : `<strong>${escapeHtml(word)}</strong>нет в словаре урока`;
  document.body.appendChild(popover);
  const rect = span.getBoundingClientRect();
  const pw = popover.offsetWidth;
  const left = Math.min(window.innerWidth - pw - 8, Math.max(8, rect.left + rect.width / 2 - pw / 2));
  const top = rect.top - popover.offsetHeight - 8;
  popover.style.left = `${left}px`;
  popover.style.top = `${top < 8 ? rect.bottom + 8 : top}px`;
  popoverTimer = setTimeout(hidePopover, 2800);
}

function wrapWords(text) {
  return tokenize(text || '')
    .map((tok) => {
      if (tok.type !== 'word') return escapeHtml(tok.text);
      const known = findWord(tok.text) ? ' known' : '';
      return `<span class="clickable-word${known}" data-word="${escapeHtml(tok.text)}">${escapeHtml(tok.text)}</span>`;
    })
    .join('');
}

export function mountReader(target, unitData) {
  container = target;
  unit = unitData;
  isPlayingAll = false;

  const paragraphs = unit?.text || [];
  if (!paragraphs.length) {
    container.innerHTML = emptyState('📖', 'В этом уроке нет текста для чтения');
    return;
  }

  container.innerHTML = `
    <div class="exercise">
      <div class="reader-toolbar">
        <h2 class="reader-title">${escapeHtml(unit.title || 'Текст урока')}</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          ${getUnitVideo(unit) ? '<button type="button" class="btn btn-secondary btn-small" id="reader-video">🎬 Смотреть видео</button>' : ''}
          <button type="button" class="btn btn-secondary btn-small" id="reader-toggle-ru">Скрыть перевод</button>
          <button type="button" class="btn btn-primary btn-small" id="reader-play-all" style="min-width:0"></button>
        </div>
      </div>
      <p class="muted">Нажмите на строку, чтобы прослушать её. Нажмите на слово — услышите произношение и увидите перевод (подчёркнуты слова из словаря урока).</p>
      <div class="reader-list" id="reader-list">
        ${paragraphs
          .map(
            (item, index) => `
          <div class="reader-row" data-index="${index}">
            <button type="button" class="reader-play" aria-label="Слушать предложение">${ICONS.play}</button>
            <div class="reader-content">
              <div class="reader-target" lang="${escapeHtml(unit.lang)}">${wrapWords(item.target)}</div>
              ${item.ru ? `<div class="reader-ru">${escapeHtml(item.ru)}</div>` : ''}
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;
  setPlayAllLabel();

  container.querySelectorAll('.reader-row').forEach((row, index) => {
    row.addEventListener('click', () => {
      if (isPlayingAll) stopPlayback();
      playParagraph(index);
    });
  });

  container.querySelector('#reader-play-all').addEventListener('click', () => {
    if (isPlayingAll) stopPlayback();
    else playAll(0);
  });

  container.querySelector('#reader-video')?.addEventListener('click', () => {
    if (isPlayingAll) stopPlayback();
    openVideoModal(getUnitVideo(unit));
  });

  container.querySelector('#reader-toggle-ru').addEventListener('click', (e) => {
    const list = container.querySelector('#reader-list');
    const hidden = list.classList.toggle('hide-ru');
    e.currentTarget.textContent = hidden ? 'Показать перевод' : 'Скрыть перевод';
  });

  container.querySelectorAll('.clickable-word').forEach((span) => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlayingAll) stopPlayback();
      const word = span.dataset.word;
      const match = findWord(word);
      const exact = match && normalizeWord(match.target) === normalizeWord(word);
      // Озвучиваем именно то слово, на которое нажали (mp3 — только при точном совпадении)
      audio.playSpeech(exact ? match.audio : '', null, null, word, unit.lang);
      showPopover(span, word, match);
    });
  });

  window.addEventListener('scroll', hidePopover, { passive: true });
}

export function destroyReader() {
  stopPlayback();
  hidePopover();
  window.removeEventListener('scroll', hidePopover);
  container = null;
  unit = null;
}
