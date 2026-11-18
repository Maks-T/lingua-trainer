import { audio } from '../core/audio.js';
import { state } from '../core/state.js';
import { escapeHtml, tokenize, normalizeWord, shuffle, toast, parseYouTube } from '../core/utils.js';

let container = null;
let currentUnit = null;

const SAMPLE_TEXT = {
  de: 'Guten Tag! Ich heiße Anna und ich komme aus Berlin. Ich lerne Englisch, weil ich viel reise. Am Wochenende lese ich gern Bücher.',
  en: 'Good morning! My name is Anna and I live in London. I am learning German because I travel a lot. At the weekend I like reading books.',
  pl: 'Dzień dobry! Mam na imię Anna i mieszkam w Warszawie. Uczę się niemieckiego, bo dużo podróżuję.',
  es: '¡Buenos días! Me llamo Ana y vivo en Madrid. Estudio alemán porque viajo mucho.',
};

const ALPHABET = {
  de: 'abcdefghijklmnopqrstuvwxyzäöüß',
  pl: 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż',
  es: 'abcdefghijlmnñopqrstuvxyzáéíóú',
  en: 'abcdefghijklmnopqrstuvwxyz',
};

// Короткие служебные слова — не годятся в «ключевые»
const STOP_WORDS = new Set(
  (
    'the and for are but not you all any can had her was one our out has him his how its may new now old see two way who did get let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what into also ' +
    'der die das und ist ich du er sie es wir ihr ein eine einen dem den des mit von aus bei nach zum zur auf für nicht auch aber oder wie was wer wo sehr noch schon dann denn doch hier sind bin bist hat habe haben war'
  ).split(' ')
);

function getLang() {
  return currentUnit?.lang || state.getActiveTrack()?.lang || 'de';
}

function getInitialText() {
  if (currentUnit?.text?.length) return currentUnit.text.map((t) => t.target).join('\n');
  return SAMPLE_TEXT[getLang()] || SAMPLE_TEXT.en;
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => tokenize(s).some((t) => t.type === 'word'));
}

function keywordFrequency(text) {
  const freq = new Map();
  tokenize(text)
    .filter((t) => t.type === 'word')
    .forEach((t) => {
      const w = t.text;
      const key = normalizeWord(w);
      if (key.length < 3 || STOP_WORDS.has(key) || /^\d+$/.test(key)) return;
      const entry = freq.get(key) || { word: w, count: 0 };
      entry.count += 1;
      freq.set(key, entry);
    });
  return [...freq.values()].sort((a, b) => b.count - a.count || b.word.length - a.word.length);
}

export function mountAnalyzer(target, unit) {
  container = target;
  currentUnit = unit;
  const lang = getLang();
  const track = state.getActiveTrack();

  container.innerHTML = `
    <div class="exercise">
      <div class="analyzer">
        <div>
          <h3 class="section-heading">Текст для разбора</h3>
          <textarea class="textarea" id="analyzer-input" lang="${escapeHtml(lang)}" placeholder="Вставьте сюда статью, диалог, субтитры или упражнение…">${escapeHtml(getInitialText())}</textarea>
          <div class="analyzer-actions">
            <button type="button" class="btn btn-secondary btn-small" id="btn-keywords">Ключевые слова</button>
            <button type="button" class="btn btn-secondary btn-small" id="btn-sentences">Предложения</button>
            <button type="button" class="btn btn-secondary btn-small" id="btn-verbs" ${lang === 'en' ? '' : 'disabled title="Разбор частей речи доступен для английского"'}>Глаголы (EN)</button>
            <button type="button" class="btn btn-secondary btn-small" id="btn-export">Скопировать JSON</button>
          </div>
        </div>

        <div>
          <h3 class="section-heading">Результат</h3>
          <div class="analyzer-results">
            <div class="analyzer-stats" id="analyzer-stats">Выберите действие слева. Нажмите на слово, чтобы услышать его.</div>
            <div class="tag-list" id="analyzer-tags"></div>
          </div>
          <h3 class="section-heading" style="margin-top:18px">Сохранить как урок</h3>
          <p class="muted">Зона: <strong>${escapeHtml(track?.title || 'не выбрана')}</strong>. Из текста будут созданы задания для всех режимов.</p>
          <form class="save-form" id="save-form" style="flex-direction:column">
            <input type="text" class="input-control" id="unit-title" maxlength="80" placeholder="Название урока" required />
            <input type="url" class="input-control" id="unit-video" placeholder="Ссылка на YouTube (необязательно)" />
            <button type="submit" class="btn btn-primary" style="min-width:0; align-self:flex-start" ${track ? '' : 'disabled'}>Сохранить урок</button>
          </form>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-keywords').addEventListener('click', showKeywords);
  container.querySelector('#btn-sentences').addEventListener('click', showSentences);
  container.querySelector('#btn-verbs').addEventListener('click', showVerbs);
  container.querySelector('#btn-export').addEventListener('click', exportJson);
  container.querySelector('#save-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveAsUnit();
  });
}

function getText() {
  return container?.querySelector('#analyzer-input')?.value.trim() || '';
}

function renderTags(list, statsText, colorClass = '') {
  const stats = container.querySelector('#analyzer-stats');
  const tags = container.querySelector('#analyzer-tags');
  stats.textContent = statsText;
  tags.innerHTML = list.length
    ? list
        .map(
          (t) =>
            `<button type="button" class="tag ${colorClass}" data-say="${escapeHtml(t.word)}">${escapeHtml(t.word)}${t.count > 1 ? `<small>×${t.count}</small>` : ''}</button>`
        )
        .join('')
    : '<span class="muted">Ничего не найдено</span>';
  tags.querySelectorAll('[data-say]').forEach((btn) =>
    btn.addEventListener('click', () => audio.playSpeech('', null, null, btn.dataset.say, getLang()))
  );
}

function showKeywords() {
  const text = getText();
  if (!text) return toast('Вставьте текст для анализа');
  audio.playClick();
  const list = keywordFrequency(text).slice(0, 40);
  renderTags(list, `Ключевые слова (без служебных): ${list.length}`);
}

function showSentences() {
  const text = getText();
  if (!text) return toast('Вставьте текст для анализа');
  audio.playClick();
  const sentences = splitSentences(text);
  const stats = container.querySelector('#analyzer-stats');
  const tags = container.querySelector('#analyzer-tags');
  stats.textContent = `Предложений: ${sentences.length}`;
  tags.innerHTML = `<ol style="padding-left:20px; display:flex; flex-direction:column; gap:6px">${sentences
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('')}</ol>`;
}

async function showVerbs() {
  const text = getText();
  if (!text) return toast('Вставьте текст для анализа');
  audio.playClick();
  const stats = container.querySelector('#analyzer-stats');
  stats.textContent = 'Загружаю NLP-модуль…';
  try {
    // compromise весит ~400 КБ — грузим только по требованию
    const { default: nlp } = await import('compromise');
    if (!container) return;
    const verbs = [...new Set(nlp(text).verbs().toInfinitive().out('array').map((v) => v.toLowerCase()))];
    renderTags(
      verbs.map((word) => ({ word, count: 1 })),
      `Глаголов (в начальной форме): ${verbs.length}`,
      'color-limeGreen'
    );
  } catch (err) {
    stats.textContent = `Не удалось загрузить NLP-модуль: ${err.message}`;
  }
}

function buildUnit(text, title, videoUrl = '') {
  const lang = getLang();
  const sentences = splitSentences(text);
  const keywords = keywordFrequency(text).slice(0, 15);
  const alphabet = ALPHABET[lang] || ALPHABET.en;
  const allWords = tokenize(text).filter((t) => t.type === 'word').map((t) => t.text);
  const id = `unit_${Date.now()}`;

  return {
    id,
    title,
    lang,
    level: state.getActiveTrack()?.level || 'custom',
    text: sentences.map((s, idx) => ({ id: `t${idx + 1}`, target: s, ru: '', audio: '' })),
    words: keywords.map((k, idx) => {
      const letters = new Set(normalizeWord(k.word));
      const pool = [...alphabet].filter((c) => !letters.has(c));
      return {
        id: `w${idx + 1}`,
        target: k.word,
        ru: '',
        transcript: '',
        distractorLetters: shuffle(pool).slice(0, 3).join(' '),
        audio: '',
      };
    }),
    // Для пазла берём предложения средней длины
    sentences: sentences
      .filter((s) => {
        const n = s.split(/\s+/).length;
        return n >= 3 && n <= 14;
      })
      .slice(0, 12)
      .map((s, idx) => {
        const own = new Set(s.split(/\s+/).map(normalizeWord));
        const distractors = shuffle([...new Set(allWords)].filter((w) => !own.has(normalizeWord(w)))).slice(0, 2);
        return { id: `s${idx + 1}`, target: s, ru: '', distractorWords: distractors, audio: '' };
      }),
    colors: [],
    ...(parseYouTube(videoUrl) ? { video: { youtube: parseYouTube(videoUrl).id, start: parseYouTube(videoUrl).start, title } } : {}),
  };
}

function saveAsUnit() {
  const text = getText();
  const titleInput = container.querySelector('#unit-title');
  const title = titleInput.value.trim();
  if (!text) return toast('Вставьте текст, который нужно сохранить');
  if (!title) return titleInput.focus();

  const track = state.getActiveTrack();
  if (!track) return toast('Сначала создайте учебную зону в настройках', 'error');

  const videoUrl = container.querySelector('#unit-video').value.trim();
  if (videoUrl && !parseYouTube(videoUrl)) {
    toast('Не удалось распознать ссылку на YouTube', 'error');
    return container.querySelector('#unit-video').focus();
  }
  const unit = buildUnit(text, title, videoUrl);
  if (!unit.text.length) return toast('В тексте не найдено предложений', 'error');

  audio.playSuccess();
  // Событие CUSTOM_UNIT_ADDED само выберет и загрузит новый урок
  state.addCustomUnit(track.id, unit);
  toast(`Урок «${title}» сохранён в «${track.title}»`, 'success');
}

async function exportJson() {
  const text = getText();
  if (!text) return toast('Вставьте текст для экспорта');
  const title = container.querySelector('#unit-title').value.trim() || 'Пользовательский урок';
  const json = JSON.stringify(buildUnit(text, title, container.querySelector('#unit-video').value.trim()), null, 2);
  try {
    await navigator.clipboard.writeText(json);
    audio.playSuccess();
    toast('JSON урока скопирован в буфер обмена', 'success');
  } catch {
    toast('Браузер запретил доступ к буферу обмена', 'error');
  }
}

export function destroyAnalyzer() {
  container = null;
  currentUnit = null;
}
