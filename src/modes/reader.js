import { audio } from '../core/audio.js';

let currentContainer = null;
let currentUnit = null;
let activeRowIndex = null;
let isPlayingAll = false;

function stopReaderPlayback() {
  isPlayingAll = false;
  audio.stopSpeech();
  if (activeRowIndex !== null && currentContainer) {
    const rows = currentContainer.querySelectorAll('.reader-row');
    rows.forEach((r) => r.classList.remove('active'));
    activeRowIndex = null;
  }
  const playAllBtn = currentContainer?.querySelector('#reader-play-all-btn');
  if (playAllBtn) playAllBtn.textContent = '▶ Слушать весь текст';
}

function playParagraph(index, onComplete = null) {
  const paragraphs = currentUnit?.text || [];
  if (index >= paragraphs.length) {
    stopReaderPlayback();
    return;
  }

  const item = paragraphs[index];
  const rows = currentContainer?.querySelectorAll('.reader-row');
  rows?.forEach((r, idx) => {
    if (idx === index) r.classList.add('active');
    else r.classList.remove('active');
  });
  activeRowIndex = index;

  audio.playSpeech(
    item.audio,
    null,
    () => {
      if (onComplete) onComplete();
    },
    item.target,
    currentUnit?.lang
  );
}

function playAllSequence(startIndex = 0) {
  isPlayingAll = true;
  const playAllBtn = currentContainer?.querySelector('#reader-play-all-btn');
  if (playAllBtn) playAllBtn.textContent = '⏹ Остановить';

  const step = (idx) => {
    if (!isPlayingAll) return;
    if (idx >= (currentUnit?.text?.length || 0)) {
      stopReaderPlayback();
      return;
    }
    playParagraph(idx, () => {
      setTimeout(() => step(idx + 1), 300);
    });
  };

  step(startIndex);
}

export function mountReader(container, unit) {
  currentContainer = container;
  currentUnit = unit;
  activeRowIndex = null;
  isPlayingAll = false;

  const paragraphs = unit.text || [];
  if (!paragraphs.length) {
    container.innerHTML = `
      <div class="feedback-banner show error" style="margin-top: 20px;">
        В этом уроке нет текста для режима чтения.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="exercise-wrapper">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h2 style="font-size: 1.2rem; font-weight: 700;">${unit.title || 'Текст урока'}</h2>
        <button type="button" class="analyzer-btn" id="reader-play-all-btn">▶ Слушать весь текст</button>
      </div>

      <div class="reader-container" id="reader-rows">
        ${paragraphs
          .map(
            (item, index) => `
          <div class="reader-row" data-index="${index}">
            <button type="button" class="audio-btn" style="position: static; transform: none;" aria-label="Слушать предложение">🔊</button>
            <div class="reader-content">
              <div class="reader-target">${wrapWordsForInspection(item.target)}</div>
              <div class="reader-ru">${item.ru}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  const rows = container.querySelectorAll('.reader-row');
  rows.forEach((row, index) => {
    const btn = row.querySelector('.audio-btn');
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlayingAll) stopReaderPlayback();
      playParagraph(index);
    });

    row.addEventListener('click', () => {
      if (isPlayingAll) stopReaderPlayback();
      playParagraph(index);
    });
  });

  const playAllBtn = container.querySelector('#reader-play-all-btn');
  playAllBtn?.addEventListener('click', () => {
    if (isPlayingAll) {
      stopReaderPlayback();
    } else {
      playAllSequence(0);
    }
  });

  // Обработка клика по отдельному слову для просмотра транскрипции/произношения
  container.querySelectorAll('.clickable-word').forEach((span) => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      const rawWord = span.dataset.word;
      const match = (unit.words || []).find(
        (w) => w.target.toLowerCase() === rawWord.toLowerCase()
      );
      if (match && (match.audio || match.target)) {
        audio.playSpeech(match.audio, null, null, match.target, currentUnit?.lang);
      }
    });
  });
}

function wrapWordsForInspection(text) {
  if (!text) return '';
  return text
    .split(' ')
    .map((token) => {
      const clean = token.replace(/[.,!?;:«»""'’]/g, '');
      return `<span class="clickable-word" data-word="${clean}" style="cursor: pointer;">${token}</span>`;
    })
    .join(' ');
}

export function destroyReader() {
  stopReaderPlayback();
  currentContainer = null;
  currentUnit = null;
  activeRowIndex = null;
}