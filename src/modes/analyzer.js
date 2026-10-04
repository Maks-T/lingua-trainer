import nlp from 'compromise';
import { audio } from '../core/audio.js';
import { state } from '../core/state.js';

let currentContainer = null;
let currentUnit = null;

export function mountAnalyzer(container, unit) {
  currentContainer = container;
  currentUnit = unit;

  container.innerHTML = `
    <div class="exercise-wrapper">
      <div class="analyzer-container">
        <div class="analyzer-input-col">
          <h3 style="font-size: 1rem; font-weight: 700;">Свободный текст для анализа</h3>
          <textarea class="analyzer-textarea" id="analyzer-text-input" placeholder="Вставьте сюда любой немецкий или английский текст статьи, диалога или упражнения...">${getInitialText(unit)}</textarea>
          <div class="analyzer-actions">
            <button type="button" class="analyzer-btn" id="btn-extract-verbs">Извлечь глаголы</button>
            <button type="button" class="analyzer-btn" id="btn-extract-words">Ключевые слова</button>
            <button type="button" class="analyzer-btn" id="btn-save-as-unit" style="background: #0f172a; border-color: #0f172a;">Сохранить в текущий трек</button>
            <button type="button" class="analyzer-btn" id="btn-export-json" style="background: #059669; border-color: #059669;">Скопировать JSON</button>
          </div>
        </div>

        <div class="analyzer-output-col">
          <h3 style="font-size: 1rem; font-weight: 700;">Результаты NLP-анализа</h3>
          <div class="analyzer-results-card">
            <div id="analyzer-stats" style="font-size: 0.85rem; color: #64748b; margin-bottom: 8px;">
              Нажмите кнопку для обработки текста
            </div>
            <div class="analyzer-tag-list" id="analyzer-tags"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-extract-verbs')?.addEventListener('click', handleExtractVerbs);
  container.querySelector('#btn-extract-words')?.addEventListener('click', handleExtractWords);
  container.querySelector('#btn-save-as-unit')?.addEventListener('click', handleSaveAsUnit);
  container.querySelector('#btn-export-json')?.addEventListener('click', handleExportJson);
}

function getInitialText(unit) {
  if (unit?.text && unit.text.length) {
    return unit.text.map((t) => t.target).join('\n');
  }
  return 'Guten Tag! Ich lerne Deutsch und Englisch. Das Programmieren macht viel Spaß.';
}

function handleExtractVerbs() {
  const input = currentContainer?.querySelector('#analyzer-text-input');
  const tagsContainer = currentContainer?.querySelector('#analyzer-tags');
  const stats = currentContainer?.querySelector('#analyzer-stats');
  if (!input || !tagsContainer || !stats) return;

  audio.playClick();
  const text = input.value.trim();
  if (!text) return;

  const doc = nlp(text);
  const verbs = doc.verbs().out('array');
  const uniqueVerbs = [...new Set(verbs.map((v) => v.toLowerCase()))];

  stats.textContent = `Найдено уникальных глаголов / связок: ${uniqueVerbs.length}`;
  tagsContainer.innerHTML = '';

  if (!uniqueVerbs.length) {
    tagsContainer.innerHTML = '<span style="color: #94a3b8;">Глаголы не обнаружены</span>';
    return;
  }

  uniqueVerbs.forEach((verb) => {
    const tag = document.createElement('span');
    tag.className = 'analyzer-tag color-limeGreen';
    tag.textContent = verb;
    tagsContainer.appendChild(tag);
  });
}

function handleExtractWords() {
  const input = currentContainer?.querySelector('#analyzer-text-input');
  const tagsContainer = currentContainer?.querySelector('#analyzer-tags');
  const stats = currentContainer?.querySelector('#analyzer-stats');
  if (!input || !tagsContainer || !stats) return;

  audio.playClick();
  const text = input.value.trim();
  if (!text) return;

  const doc = nlp(text);
  const terms = doc.terms().out('array');

  const frequency = {};
  terms.forEach((term) => {
    const clean = term.toLowerCase().replace(/[^a-zA-ZäöüßÄÖÜа-яА-Я0-9]/g, '');
    if (clean.length >= 3) {
      frequency[clean] = (frequency[clean] || 0) + 1;
    }
  });

  const sortedWords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  stats.textContent = `Уникальных слов (от 3 букв): ${sortedWords.length}`;
  tagsContainer.innerHTML = '';

  if (!sortedWords.length) {
    tagsContainer.innerHTML = '<span style="color: #94a3b8;">Слова не обнаружены</span>';
    return;
  }

  sortedWords.forEach(([word, count]) => {
    const tag = document.createElement('span');
    tag.className = 'analyzer-tag';
    tag.textContent = `${word} (${count})`;
    tagsContainer.appendChild(tag);
  });
}

function handleSaveAsUnit() {
  const input = currentContainer?.querySelector('#analyzer-text-input');
  const stats = currentContainer?.querySelector('#analyzer-stats');
  if (!input) return;

  const text = input.value.trim();
  if (!text) {
    alert('Введите текст для сохранения в трек.');
    return;
  }

  const track = state.getActiveTrack();
  if (!track) {
    alert('Сначала создайте или выберите доменный трек в шапке.');
    return;
  }

  const defaultTitle = `Урок: ${text.slice(0, 24).trim()}...`;
  const title = prompt('Введите название для нового урока:', defaultTitle);
  if (!title) return;

  audio.playSuccess();
  const doc = nlp(text);
  const rawSentences = text
    .split(/[\r\n]+|[.!?]+\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const terms = doc.terms().out('array');
  const uniqueWords = [
    ...new Set(
      terms
        .map((t) => t.toLowerCase().replace(/[^a-zA-ZäöüßÄÖÜа-яА-Я0-9]/g, ''))
        .filter((w) => w.length >= 3)
    ),
  ].slice(0, 15);

  const newUnit = {
    id: `unit_${Date.now()}`,
    title: title.trim(),
    lang: track.lang || 'de',
    level: track.level || 'custom',
    text: rawSentences.map((s, idx) => ({
      id: `t${idx + 1}`,
      target: s,
      ru: 'Текст для чтения и отработки',
      audio: '',
    })),
    words: uniqueWords.map((w, idx) => ({
      id: `w${idx + 1}`,
      target: w,
      ru: 'Ключевое слово',
      transcript: '',
      distractorLetters: 'a e i o u',
      audio: '',
    })),
    sentences: rawSentences.slice(0, 8).map((s, idx) => ({
      id: `s${idx + 1}`,
      target: s,
      ru: 'Соберите фразу',
      distractorWords: [],
      audio: '',
    })),
    colors: [],
  };

  const saved = state.addCustomUnit(track.id, newUnit);
  state.setActiveUnit(saved);

  if (stats) {
    stats.textContent = `✓ Урок "${newUnit.title}" сохранен в трек "${track.title}"! Можете сразу переключиться на Пазл или Ридер.`;
  }
}

function handleExportJson() {
  const input = currentContainer?.querySelector('#analyzer-text-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  audio.playSuccess();
  const doc = nlp(text);
  const terms = doc.terms().out('array');
  const unique = [
    ...new Set(
      terms
        .map((t) => t.toLowerCase().replace(/[^a-zA-ZäöüßÄÖÜа-яА-Я0-9]/g, ''))
        .filter((w) => w.length >= 3)
    ),
  ].slice(0, 20);

  const moduleTemplate = {
    id: `custom-${Date.now()}`,
    title: 'Пользовательский импортированный модуль',
    lang: currentUnit?.lang || 'de',
    level: currentUnit?.level || 'a1',
    words: unique.map((w, index) => ({
      id: `w${index + 1}`,
      target: w,
      ru: 'Перевод',
      transcript: '',
      distractorLetters: 'a e i',
      audio: '',
    })),
  };

  const jsonString = JSON.stringify(moduleTemplate, null, 2);
  navigator.clipboard.writeText(jsonString).then(() => {
    const stats = currentContainer?.querySelector('#analyzer-stats');
    if (stats) {
      const prev = stats.textContent;
      stats.textContent = '✓ Шаблон модуля unit_v2 скопирован в буфер обмена!';
      setTimeout(() => {
        stats.textContent = prev;
      }, 3000);
    }
  });
}

export function destroyAnalyzer() {
  currentContainer = null;
  currentUnit = null;
}