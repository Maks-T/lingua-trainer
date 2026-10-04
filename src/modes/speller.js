import { state } from '../core/state.js';
import { audio } from '../core/audio.js';

let currentContainer = null;
let currentUnit = null;
let currentIndex = 0;
let questions = [];
let selectedLetters = [];
let bankLetters = [];
let isChecked = false;

function normalize(str) {
  return (str || '').toLowerCase().trim();
}

function renderCurrentWord() {
  if (!currentContainer) return;

  if (currentIndex >= questions.length) {
    audio.playWin();
    currentContainer.innerHTML = `
      <div class="exercise-wrapper">
        <div class="feedback-banner show success" style="margin-top: 40px;">
          🎉 Все слова урока успешно собраны!
        </div>
        <div class="controls-panel">
          <button type="button" class="btn-action btn-next" id="speller-restart-btn">Пройти заново</button>
        </div>
      </div>
    `;
    currentContainer.querySelector('#speller-restart-btn')?.addEventListener('click', () => {
      currentIndex = 0;
      questions = [...(currentUnit.words || [])].sort(() => Math.random() - 0.5);
      renderCurrentWord();
    });
    return;
  }

  const q = questions[currentIndex];
  isChecked = false;
  selectedLetters = [];

  const targetLetters = q.target.replace(/\s+/g, '').split('');
  let distractors = [];
  if (typeof q.distractorLetters === 'string') {
    distractors = q.distractorLetters.replace(/\s+/g, '').split('');
  } else if (Array.isArray(q.distractorLetters)) {
    distractors = q.distractorLetters;
  }

  const rawBank = [...targetLetters, ...distractors];
  bankLetters = rawBank
    .map((char, id) => ({ id: `letter-${id}-${char}`, text: char }))
    .sort(() => Math.random() - 0.5);

  currentContainer.innerHTML = `
    <div class="exercise-wrapper">
      <div class="prompt-card">
        <div class="prompt-ru">${q.ru || ''}</div>
        ${q.transcript ? `<div class="prompt-transcript">${q.transcript}</div>` : ''}
        <button type="button" class="audio-btn" id="speller-audio-btn" aria-label="Прослушать">🔊</button>
      </div>

      <div class="board-container">
        <div class="target-slots" id="speller-target-slots" data-placeholder="Соберите слово по буквам"></div>
        <div class="source-bank" id="speller-source-bank"></div>
      </div>

      <div class="feedback-banner" id="speller-feedback"></div>

      <div class="controls-panel">
        <button type="button" class="btn-action btn-backspace" id="speller-backspace-btn">Стереть</button>
        <button type="button" class="btn-action btn-check" id="speller-check-btn">Проверить</button>
        <button type="button" class="btn-action btn-next" id="speller-next-btn" style="display: none;">Следующее</button>
      </div>
    </div>
  `;

  const audioBtn = currentContainer.querySelector('#speller-audio-btn');
  audioBtn?.addEventListener('click', () => {
    audioBtn.classList.add('playing');
    audio.playSpeech(q.audio, null, () => audioBtn.classList.remove('playing'), q.target, currentUnit?.lang);
  });

  currentContainer.querySelector('#speller-backspace-btn')?.addEventListener('click', handleBackspace);
  currentContainer.querySelector('#speller-check-btn')?.addEventListener('click', handleCheck);
  currentContainer.querySelector('#speller-next-btn')?.addEventListener('click', handleNext);

  renderLetters();
}

function renderLetters() {
  if (!currentContainer) return;
  const targetSlots = currentContainer.querySelector('#speller-target-slots');
  const sourceBank = currentContainer.querySelector('#speller-source-bank');
  if (!targetSlots || !sourceBank) return;

  targetSlots.innerHTML = '';
  selectedLetters.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = 'chip letter';
    chip.textContent = item.text;
    if (!isChecked) {
      chip.addEventListener('click', () => {
        audio.playClick();
        selectedLetters.splice(index, 1);
        bankLetters.push(item);
        renderLetters();
      });
    }
    targetSlots.appendChild(chip);
  });

  sourceBank.innerHTML = '';
  bankLetters.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = 'chip letter';
    chip.textContent = item.text;
    if (!isChecked) {
      chip.addEventListener('click', () => {
        audio.playClick();
        bankLetters.splice(index, 1);
        selectedLetters.push(item);
        renderLetters();
      });
    }
    sourceBank.appendChild(chip);
  });
}

function handleBackspace() {
  if (isChecked || selectedLetters.length === 0) return;
  audio.playClick();
  const removed = selectedLetters.pop();
  if (removed) {
    bankLetters.push(removed);
  }
  renderLetters();
}

function handleCheck() {
  if (isChecked) return;
  const q = questions[currentIndex];
  const assembled = selectedLetters.map((l) => l.text).join('');
  const isCorrect = normalize(assembled) === normalize(q.target);
  const feedback = currentContainer?.querySelector('#speller-feedback');
  const checkBtn = currentContainer?.querySelector('#speller-check-btn');
  const nextBtn = currentContainer?.querySelector('#speller-next-btn');
  const audioBtn = currentContainer?.querySelector('#speller-audio-btn');

  isChecked = true;
  state.recordAnswer(currentUnit.id, isCorrect);

  if (isCorrect) {
    audio.playSuccess();
    if (feedback) {
      feedback.className = 'feedback-banner show success';
      feedback.textContent = `✓ Верно: ${q.target}`;
    }
  } else {
    audio.playMistake();
    if (feedback) {
      feedback.className = 'feedback-banner show error';
      feedback.innerHTML = `✕ Ошибка. Правильное написание: <strong>${q.target}</strong>`;
    }
  }

  if (q.audio) {
    audioBtn?.classList.add('playing');
    audio.playSpeech(q.audio, null, () => audioBtn?.classList.remove('playing'), q.target, currentUnit?.lang);
  }

  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'inline-block';
  renderLetters();
}

function handleNext() {
  audio.playClick();
  currentIndex += 1;
  renderCurrentWord();
}

function handleKeyDown(event) {
  if (event.key === 'Backspace') {
    handleBackspace();
  } else if (event.key === 'Enter') {
    if (isChecked) handleNext();
    else handleCheck();
  }
}

export function mountSpeller(container, unit) {
  currentContainer = container;
  currentUnit = unit;
  currentIndex = 0;
  questions = [...(unit.words || [])].sort(() => Math.random() - 0.5);

  if (!questions.length) {
    container.innerHTML = `
      <div class="feedback-banner show error" style="margin-top: 20px;">
        В этом уроке нет слов для режима спеллера.
      </div>
    `;
    return;
  }

  window.addEventListener('keydown', handleKeyDown);
  renderCurrentWord();
}

export function destroySpeller() {
  window.removeEventListener('keydown', handleKeyDown);
  audio.stopSpeech();
  currentContainer = null;
  currentUnit = null;
}