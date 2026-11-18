/**
 * Общая логика «пропусков» для диктанта и видео-диктанта.
 */
import { shuffle, normalizeWord, foldGerman, levenshtein } from './utils.js';

export const GAP_LEVELS = {
  easy: { label: '1 пропуск' },
  medium: { label: 'Несколько' },
  full: { label: 'Целиком' },
};

export const SPECIAL_KEYS = {
  de: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'],
  pl: ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'],
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡'],
};

/** Основы слов из словаря урока — их пропускаем в первую очередь. */
function vocabularyStems(words = []) {
  return words
    .map((w) => normalizeWord(w.target))
    .filter((w) => w.length >= 3)
    .map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w));
}

/** Индексы токенов-слов, которые станут пропусками. */
export function pickGapIndices(tokens, level, unitWords = []) {
  const wordIdx = tokens.map((t, i) => (t.type === 'word' ? i : -1)).filter((i) => i !== -1);
  if (level === 'full') return wordIdx;

  const stems = vocabularyStems(unitWords);
  const score = (i) => {
    const w = normalizeWord(tokens[i].text);
    if (stems.some((s) => w.startsWith(s))) return 3;
    if (w.length >= 5) return 2;
    if (w.length >= 3) return 1;
    return 0;
  };
  const count = level === 'easy' ? 1 : Math.min(5, Math.max(2, Math.round(wordIdx.length / 4)));
  const ranked = shuffle(wordIdx).sort((a, b) => score(b) - score(a));
  return ranked.slice(0, Math.min(count, wordIdx.length)).sort((a, b) => a - b);
}

/** 'correct' | 'almost' | 'wrong' */
export function gradeGap(value, answer, lang) {
  const v = normalizeWord(value);
  const a = normalizeWord(answer);
  if (!v) return 'wrong';
  if (v === a) return 'correct';
  if (lang === 'de' && foldGerman(value) === foldGerman(answer)) return 'correct';
  if (a.length >= 4 && levenshtein(v, a) <= 1) return 'almost';
  return 'wrong';
}

/** Вставка символа (ä, ß…) в поле ввода с сохранением курсора. */
export function insertIntoInput(input, ch) {
  if (!input || input.readOnly) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + ch + input.value.slice(end);
  input.focus();
  input.setSelectionRange(start + ch.length, start + ch.length);
}
