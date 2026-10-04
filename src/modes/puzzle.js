import { state } from '../core/state.js';
import { audio } from '../core/audio.js';

let currentContainer = null;
let currentUnit = null;
let currentIndex = 0;
let questions = [];
let selectedWords = [];
let bankWords = [];
let isChecked = false;

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\s.,!?;:«»""'’]/g, '');
}

function getColorClass(word, colors = []) {
  if (!colors || !colors.length) return '';
  const clean = normalize(word);
  for (const group of colors) {
    if (group.words.some((w) => normalize(w) === clean)) {
      return `color-${group.color}`;
    }
  }
  return '';
}

function renderCurrentQuestion() {
  if (!currentContainer) return;

  if (currentIndex >= questions.length) {
    audio.playWin();
    currentContainer.innerHTML = `
      <div class="exercise-wrapper">
        <div class="feedback-banner show success" style="margin-top: 40px;">
          🎉 Все предложения урока успешно пройдены!
        </div>
        <div class="controls-panel">
          <button type="button" class="btn-action btn-next" id="puzzle-restart-btn">Пройти заново</button>
        </div>
      </div>
    `;
    currentContainer.querySelector('#puzzle-restart-btn')?.addEventListener('click', () => {
      currentIndex = 0;
      questions = [...(currentUnit.sentences || [])].sort(() => Math.random() - 0.5);
      renderCurrentQuestion();
    });
    return;
  }

  const q = questions[currentIndex];
  isChecked = false;
  selectedWords = [];

  const targetList = (q.target || '').split(' ').filter(Boolean);
  let distractors = [];
  if (Array.isArray(q.distractorWords)) {
    distractors = q.distractorWords;
  } else if (typeof q.distractorWords === 'string' && q.distractorWords.trim()) {
    distractors = q.distractorWords.split(/[\s/]+/).filter(Boolean);
  }

  const rawBank = [...targetList, ...distractors];
  bankWords = rawBank
    .map((word, id) => ({ id: `word-${id}-${word}`, text: word }))
    .sort(() => Math.random() - 0.5);

  currentContainer.innerHTML = `
    <div class="exercise-wrapper">
      <div class="prompt-card">
        <div class="prompt-ru">${q.ru || ''}</div>
        ${q.transcript ? `<div class="prompt-transcript">${q.transcript}</div>` : ''}
        <button type="button" class="audio-btn" id="puzzle-audio-btn" aria-label="Прослушать">🔊</button>
      </div>

      <div class="board-container">
        <div class="target-slots" id="puzzle-target-slots" data-placeholder="Нажимайте на слова, чтобы собрать фразу"></div>
        <div class="source-bank" id="puzzle-source-bank"></div>
      </div>

      <div class="feedback-banner" id="puzzle-feedback"></div>

      <div class="controls-panel">
        <button type="button" class="btn-action btn-backspace" id="puzzle-backspace-btn">Стереть</button>
        <button type="button" class="btn-action btn-check" id="puzzle-check-btn">Проверить</button>
        <button type="button" class="btn-action btn-next" id="puzzle-next-btn" style="display: none;">Следующий</button>
      </div>
    </div>
  `;

  const audioBtn = currentContainer.querySelector('#puzzle-audio-btn');
  audioBtn?.addEventListener('click', () => {
    audioBtn.classList.add('playing');
    audio.playSpeech(q.audio, null, () => audioBtn.classList.remove('playing'), q.target, currentUnit?.lang);
  });

  currentContainer.querySelector('#puzzle-backspace-btn')?.addEventListener('click', handleBackspace);
  currentContainer.querySelector('#puzzle-check-btn')?.addEventListener('click', handleCheck);
  currentContainer.querySelector('#puzzle-next-btn')?.addEventListener('click', handleNext);

  renderChips();
}

function renderChips() {
  if (!currentContainer) return;
  const targetSlots = currentContainer.querySelector('#puzzle-target-slots');
  const sourceBank = currentContainer.querySelector('#puzzle-source-bank');
  if (!targetSlots || !sourceBank) return;

  targetSlots.innerHTML = '';
  selectedWords.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = `chip ${getColorClass(item.text, currentUnit.colors)}`;
    chip.textContent = item.text;
    if (!isChecked) {
      chip.addEventListener('click', () => {
        audio.playClick();
        selectedWords.splice(index, 1);
        bankWords.push(item);
        renderChips();
      });
    }
    targetSlots.appendChild(chip);
  });

  sourceBank.innerHTML = '';
  bankWords.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = `chip ${getColorClass(item.text, currentUnit.colors)}`;
    chip.textContent = item.text;
    if (!isChecked) {
      chip.addEventListener('click', () => {
        audio.playClick();
        bankWords.splice(index, 1);
        selectedWords.push(item);
        renderChips();
      });
    }
    sourceBank.appendChild(chip);
  });
}

function handleBackspace() {
  if (isChecked || selectedWords.length === 0) return;
  audio.playClick();
  const removed = selectedWords.pop();
  if (removed) {
    bankWords.push(removed);
  }
  renderChips();
}

function handleCheck() {
  if (isChecked) return;
  const q = questions[currentIndex];
  const assembledText = selectedWords.map((w) => w.text).join(' ');
  const isCorrect = normalize(assembledText) === normalize(q.target);
  const feedback = currentContainer?.querySelector('#puzzle-feedback');
  const checkBtn = currentContainer?.querySelector('#puzzle-check-btn');
  const nextBtn = currentContainer?.querySelector('#puzzle-next-btn');
  const audioBtn = currentContainer?.querySelector('#puzzle-audio-btn');

  isChecked = true;
  state.recordAnswer(currentUnit.id, isCorrect);

  if (isCorrect) {
    audio.playSuccess();
    if (feedback) {
      feedback.className = 'feedback-banner show success';
      feedback.textContent = `✓ Правильно: ${q.target}`;
    }
  } else {
    audio.playMistake();
    if (feedback) {
      feedback.className = 'feedback-banner show error';
      feedback.innerHTML = `✕ Ошибка. Правильно: <strong>${q.target}</strong>`;
    }
  }

  if (q.audio) {
    audioBtn?.classList.add('playing');
    audio.playSpeech(q.audio, null, () => audioBtn?.classList.remove('playing'), q.target, currentUnit?.lang);
  }

  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'inline-block';
  renderChips();
}

function handleNext() {
  audio.playClick();
  currentIndex += 1;
  renderCurrentQuestion();
}

export function mountPuzzle(container, unit) {
  currentContainer = container;
  currentUnit = unit;
  currentIndex = 0;
  questions = [...(unit.sentences || [])].sort(() => Math.random() - 0.5);

  if (!questions.length) {
    container.innerHTML = `
      <div class="feedback-banner show error" style="margin-top: 20px;">
        В этом уроке нет предложений для режима пазла.
      </div>
    `;
    return;
  }

  renderCurrentQuestion();
}

export function destroyPuzzle() {
  audio.stopSpeech();
  currentContainer = null;
  currentUnit = null;
}