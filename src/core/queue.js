/**
 * Очередь «по кругу, пока не ответишь правильно» (как в eng-puzzle-for-kids):
 * верный ответ убирает задание из очереди, ошибочное уходит в конец и вернётся позже.
 */
import { escapeHtml } from './utils.js';

export function createQueue(items) {
  const queue = [...items];
  const missed = new Set(); // задания, на которых уже ошибались
  const total = items.length;
  let firstTry = 0;
  let mistakes = 0;

  return {
    get current() {
      return queue[0] || null;
    },
    get done() {
      return queue.length === 0;
    },
    get total() {
      return total;
    },
    get remaining() {
      return queue.length;
    },
    get solved() {
      return total - queue.length;
    },
    get firstTry() {
      return firstTry;
    },
    get mistakes() {
      return mistakes;
    },
    /** Задание уже показывалось и было решено неверно. */
    get isRepeat() {
      return Boolean(queue[0]) && missed.has(queue[0]);
    },
    /** Первая ли это попытка для текущего задания (для статистики). */
    get isFirstAttempt() {
      return Boolean(queue[0]) && !missed.has(queue[0]);
    },
    /** Фиксирует результат текущего задания и переходит к следующему. */
    resolve(isCorrect) {
      const item = queue.shift();
      if (!item) return;
      if (isCorrect) {
        if (!missed.has(item)) firstTry += 1;
      } else {
        mistakes += 1;
        missed.add(item);
        queue.push(item);
      }
    },
  };
}

/** Шапка упражнения со счётчиками очереди. */
export function queueHeader(title, q) {
  const pct = q.total ? Math.round((q.solved / q.total) * 100) : 0;
  return `
    <div class="exercise-head">
      <span class="exercise-kicker">${escapeHtml(title)}${q.isRepeat ? ' <span class="repeat-badge">🔁 повтор</span>' : ''}</span>
      <span class="exercise-counter" title="Осталось / всего">
        осталось <strong>${q.remaining}</strong> из ${q.total}
        <span class="counter-sep">·</span> <span class="text-success">✓ ${q.firstTry}</span>
        <span class="counter-sep">·</span> <span class="text-danger">✕ ${q.mistakes}</span>
      </span>
    </div>
    <div class="exercise-progress"><span style="width:${pct}%"></span></div>
  `;
}

/** Экран завершения серии. */
export function queueFinish({ icon = '🎉', title, q, restartId }) {
  const pct = q.total ? Math.round((q.firstTry / q.total) * 100) : 0;
  return `
    <div class="finish-screen">
      <div class="finish-icon">${icon}</div>
      <h2>${escapeHtml(title)}</h2>
      <p class="finish-score">Всё решено правильно! С первой попытки: <strong>${q.firstTry}</strong> из ${q.total} (${pct}%)</p>
      <p class="muted">Ошибок по пути: ${q.mistakes}${q.mistakes ? ' — все задания с ошибками повторены до верного ответа' : ''}</p>
      <button type="button" class="btn btn-primary" id="${restartId}">Пройти заново</button>
    </div>
  `;
}
