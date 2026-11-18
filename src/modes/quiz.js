import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { getQuizItems } from '../core/exercises.js';
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
  normalizeWord,
  tokenize,
  ICONS,
} from '../core/utils.js';

let container = null;

/** Enter/Пробел на кнопке внутри упражнения сработает как клик — не дублируем. */
const isOwnButton = (e) => e.target instanceof HTMLButtonElement && Boolean(container?.contains(e.target));
let unit = null;
let queue = null;
let lastCorrect = false;
let answered = false;
let options = [];

function start() {
  queue = createQueue(shuffle(getQuizItems(unit)));
  renderQuestion();
}

function renderFinish() {
  audio.playWin();
  container.innerHTML = queueFinish({ title: 'Вопросы пройдены!', q: queue, restartId: 'quiz-restart' });
  container.querySelector('#quiz-restart')?.addEventListener('click', start);
}

function refSnippet(item) {
  if (!item.ref) return '';
  const para = (unit.text || []).find((t) => t.id === item.ref);
  if (!para) return '';
  // Подсвечиваем в тексте слова ответа, чтобы было видно, откуда он взят
  const answerWords = new Set(
    tokenize(item.answer)
      .filter((t) => t.type === 'word' && t.text.length > 2)
      .map((t) => normalizeWord(t.text))
  );
  const html = tokenize(para.target)
    .map((tok) =>
      tok.type === 'word' && answerWords.has(normalizeWord(tok.text))
        ? `<mark>${escapeHtml(tok.text)}</mark>`
        : escapeHtml(tok.text)
    )
    .join('');
  return `<div class="ref-snippet">📖 ${html}</div>`;
}

function renderQuestion() {
  if (!container) return;
  if (queue.done) {
    renderFinish();
    return;
  }

  const item = queue.current;
  answered = false;
  options = shuffle([...new Set(item.options)]);
  const kicker =
    item.kind === 'translation' ? 'Выберите перевод' : item.kind === 'cloze' ? 'Какое слово пропущено?' : 'Ответьте на вопрос по тексту';
  const canListen = Boolean(item.speakText);

  container.innerHTML = `
    <div class="exercise">
      ${queueHeader(kicker, queue)}
      <div class="prompt">
        <h1 class="prompt-title" lang="${escapeHtml(unit.lang)}">${escapeHtml(item.question)}</h1>
        ${
          item.hint
            ? item.kind === 'comprehension'
              ? `<button type="button" class="toggle-ru" id="quiz-toggle-ru">Показать перевод вопроса</button>
                 <div class="prompt-hint" id="quiz-ru" hidden>${escapeHtml(item.hint)}</div>`
              : `<div class="prompt-hint">${escapeHtml(item.hint)}</div>`
            : ''
        }
      </div>
      ${canListen ? listenButton('quiz-listen', 'Прослушать вопрос', '') : ''}
      <div class="quiz-options" role="group" aria-label="Варианты ответа">
        ${options
          .map(
            (opt, i) => `
          <button type="button" class="quiz-option" data-index="${i}">
            <span class="quiz-key">${i + 1}</span>
            <span>${escapeHtml(opt)}</span>
          </button>`
          )
          .join('')}
      </div>
      <div class="feedback" id="quiz-feedback" role="status"></div>
      <div id="quiz-ref"></div>
      <div class="controls">
        <span class="muted">Нажмите 1–${options.length} или выберите вариант</span>
        <div class="controls-right">
          <button type="button" class="btn btn-primary" id="quiz-next" hidden>Далее ${ICONS.arrow}</button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.quiz-option').forEach((btn) => {
    btn.addEventListener('click', () => choose(Number(btn.dataset.index)));
  });
  container.querySelector('#quiz-toggle-ru')?.addEventListener('click', (e) => {
    container.querySelector('#quiz-ru').hidden = false;
    e.currentTarget.remove();
  });
  container.querySelector('#quiz-listen')?.addEventListener('click', listen);
  container.querySelector('#quiz-next').addEventListener('click', next);
}

function listen() {
  if (!container || !unit) return;
  const item = queue?.current;
  if (!item?.speakText) return;
  playWithButton(audio, container?.querySelector('#quiz-listen'), item.audio, item.speakText, unit.lang);
}

function choose(optIndex) {
  if (answered || !options[optIndex]) return;
  answered = true;
  const item = queue.current;
  const chosen = options[optIndex];
  const isCorrect = chosen === item.answer;

  state.recordAnswer(unit.id, isCorrect, item.key);
  lastCorrect = isCorrect;

  container.querySelectorAll('.quiz-option').forEach((btn) => {
    const opt = options[Number(btn.dataset.index)];
    btn.disabled = true;
    if (opt === item.answer) btn.classList.add('correct');
    else if (Number(btn.dataset.index) === optIndex) btn.classList.add('wrong');
    else btn.classList.add('dimmed');
  });

  const feedback = container.querySelector('#quiz-feedback');
  if (isCorrect) {
    audio.playSuccess();
    showFeedback(feedback, 'success', 'Верно!');
  } else {
    audio.playMistake();
    showFeedback(feedback, 'error', `Правильный ответ: <strong>${escapeHtml(item.answer)}</strong>`, '🔁 вопрос вернётся позже');
  }
  container.querySelector('#quiz-ref').innerHTML = refSnippet(item);

  const nextBtn = container.querySelector('#quiz-next');
  nextBtn.hidden = false;
  nextBtn.focus();

  // Для пропущенного слова озвучиваем полное предложение
  if (item.kind === 'cloze' && item.ref) {
    const para = (unit.text || []).find((t) => t.id === item.ref);
    if (para) audio.playSpeech(para.audio, null, null, para.target, unit.lang);
  }
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

  if (/^[1-9]$/.test(e.key) && !answered) {
    e.preventDefault();
    choose(Number(e.key) - 1);
  } else if (e.key === 'Enter' && answered && !isOwnButton(e)) {
    e.preventDefault();
    next();
  } else if (e.key === ' ' && !isOwnButton(e)) {
    e.preventDefault();
    listen();
  }
}

export function mountQuiz(target, unitData) {
  container = target;
  unit = unitData;
  if (!getQuizItems(unit).length) {
    container.innerHTML = emptyState(
      '❓',
      'Для этого урока пока нет вопросов',
      'Добавьте в JSON урока массив <code>questions</code> или текст — вопросы на пропущенные слова создадутся автоматически.'
    );
    return;
  }
  window.addEventListener('keydown', onKeyDown);
  start();
}

export function destroyQuiz() {
  window.removeEventListener('keydown', onKeyDown);
  audio.stopSpeech();
  container = null;
  unit = null;
}
