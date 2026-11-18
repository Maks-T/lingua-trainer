/**
 * Субтитры (.vtt / .srt) → законченные предложения с таймингами.
 *
 * Реплики субтитров режут фразы где угодно («why you're going to fail / to have a great career»),
 * поэтому склеиваем все реплики в поток слов, оцениваем время каждого слова
 * пропорционально его позиции внутри реплики и заново режем поток по концам предложений.
 */

const TIME_RE = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function parseTime(str) {
  const m = str.match(TIME_RE);
  if (!m) return null;
  const h = m[1] ? Number(m[1].slice(0, -1)) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

/** Служебные строки: авторы перевода, ремарки вроде (Laughter), [Music]. */
function cleanCueText(text) {
  return text
    .replace(/<[^>]+>/g, '') // теги VTT: <c>, <i>, <00:00:01.000>
    .replace(/\{[^}]*\}/g, '') // теги SSA в SRT
    .replace(/^(Transcriber|Translator|Reviewer|Субтитры|Переводчик|Редактор)\s*:.*$/gim, '')
    .replace(/\((?:[^()]*)\)|\[(?:[^\]]*)\]/g, ' ')
    .replace(/\s+--\s*|\s*--\s+|--$/g, ' — ')
    .replace(/♪/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Разбор .vtt и .srt в массив реплик { start, end, text }. */
export function parseSubtitles(raw) {
  const cues = [];
  const blocks = String(raw || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const start = parseTime(a);
    const end = parseTime(b);
    if (start === null || end === null) continue;
    const text = cleanCueText(lines.slice(timeIdx + 1).join(' '));
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    cues.push({ start, end: Math.max(end, start + 0.2), text });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Поток слов с оценкой времени произнесения каждого. */
function cuesToWords(cues) {
  const words = [];
  cues.forEach((cue, cueIndex) => {
    const parts = cue.text.split(' ').filter(Boolean);
    const totalChars = parts.reduce((n, w) => n + w.length + 1, 0);
    const dur = cue.end - cue.start;
    let offset = 0;
    parts.forEach((text) => {
      const start = cue.start + (offset / totalChars) * dur;
      offset += text.length + 1;
      const end = cue.start + (offset / totalChars) * dur;
      words.push({ text, start, end, cueIndex });
    });
  });
  return words;
}

const SENTENCE_END = /[.!?…]["'”’»)]*$/;
const SOFT_BREAK = /[,;:—]["'”’»)]*$|^—$/;
const MAX_WORDS = 28;
const MIN_WORDS = 3;

function finalizeSentence(words) {
  const text = words
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .replace(/^—\s*|\s*—$/g, '')
    .trim();
  return { text, start: words[0].start, end: words[words.length - 1].end, wordCount: words.length };
}

/**
 * Предложения для видео-диктанта.
 * @returns {{id: string, text: string, start: number, end: number}[]}
 */
export function buildSentences(cues) {
  const words = cuesToWords(cues);
  const raw = [];
  let current = [];

  const flush = () => {
    if (current.length) raw.push(finalizeSentence(current));
    current = [];
  };

  words.forEach((word, i) => {
    current.push(word);
    const nextWord = words[i + 1];
    const pause = nextWord ? nextWord.start - word.end : Infinity;

    if (SENTENCE_END.test(word.text)) {
      flush();
    } else if (current.length >= MAX_WORDS && (SOFT_BREAK.test(word.text) || nextWord?.cueIndex !== word.cueIndex)) {
      // Слишком длинное предложение — режем по запятой или границе реплики
      flush();
    } else if (pause > 2.5 && current.length >= MIN_WORDS) {
      // Долгая пауза (смех, аплодисменты) — тоже конец фразы
      flush();
    }
  });
  flush();

  // Очень короткие фразы («Hmm. Not.», «Unless.») приклеиваем к соседней, если между ними нет паузы
  const merged = [];
  raw.forEach((s) => {
    const prev = merged[merged.length - 1];
    if (prev && (s.wordCount < MIN_WORDS || prev.wordCount < MIN_WORDS) && s.start - prev.end < 1.2 && prev.wordCount + s.wordCount <= MAX_WORDS) {
      prev.text = `${prev.text} ${s.text}`;
      prev.end = s.end;
      prev.wordCount += s.wordCount;
    } else {
      merged.push({ ...s });
    }
  });

  return merged
    .filter((s) => /[\p{L}]/u.test(s.text))
    .map((s, i) => ({
      id: `v${i + 1}`,
      text: s.text,
      // Небольшой запас по краям, чтобы не обрезать первое и последнее слово
      start: Math.max(0, s.start - 0.15),
      end: s.end + 0.35,
    }));
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
