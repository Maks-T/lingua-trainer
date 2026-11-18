/**
 * Построение заданий из данных урока. Используется режимами и подсчётом прогресса.
 */
import { shuffle, tokenize, normalizeWord } from './utils.js';

const PLACEHOLDER_RU = new Set(['', 'Ключевое слово', 'Перевод', 'Текст для чтения и отработки', 'Соберите фразу']);

function hasRealTranslation(item) {
  return Boolean(item?.ru) && !PLACEHOLDER_RU.has(item.ru.trim());
}

/** Вопросы к тексту: из поля questions урока, иначе — автогенерация. */
export function getQuizItems(unit) {
  if (!unit) return [];

  if (Array.isArray(unit.questions) && unit.questions.length) {
    return unit.questions
      .filter((q) => q.question && q.answer)
      .map((q) => ({
        key: `quiz:${q.id}`,
        kind: 'comprehension',
        question: q.question,
        questionLang: unit.lang,
        hint: q.ru || '',
        answer: q.answer,
        options: q.options?.length ? q.options : [q.answer],
        audio: q.audio || '',
        speakText: q.question,
        ref: q.ref || null,
      }));
  }

  const items = [];

  // 1) Перевод слов (если в уроке есть настоящие переводы)
  const words = (unit.words || []).filter((w) => w.target && hasRealTranslation(w));
  if (words.length >= 4) {
    words.forEach((w) => {
      const others = shuffle(words.filter((o) => o.id !== w.id && o.ru !== w.ru)).slice(0, 3);
      items.push({
        key: `quiz:auto-${w.id}`,
        kind: 'translation',
        question: w.target,
        questionLang: unit.lang,
        hint: 'Выберите правильный перевод',
        answer: w.ru,
        options: [w.ru, ...others.map((o) => o.ru)],
        audio: w.audio || '',
        speakText: w.target,
        ref: null,
      });
    });
  }

  // 2) «Какое слово пропущено?» по тексту — работает для любого текста
  const textItems = unit.text || [];
  const vocabulary = [
    ...new Set(
      textItems.flatMap((t) =>
        tokenize(t.target || '')
          .filter((tok) => tok.type === 'word' && tok.text.length >= 4)
          .map((tok) => tok.text)
      )
    ),
  ];

  if (vocabulary.length >= 4) {
    textItems.forEach((t) => {
      const tokens = tokenize(t.target || '');
      const candidates = tokens
        .map((tok, idx) => ({ tok, idx }))
        .filter(({ tok }) => tok.type === 'word' && tok.text.length >= 4);
      if (!candidates.length) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const sentence = tokens.map((tok, idx) => (idx === pick.idx ? '_____' : tok.text)).join('');
      const distractors = shuffle(
        vocabulary.filter((v) => normalizeWord(v) !== normalizeWord(pick.tok.text))
      ).slice(0, 3);
      items.push({
        key: `quiz:cloze-${t.id}`,
        kind: 'cloze',
        question: sentence,
        questionLang: unit.lang,
        hint: hasRealTranslation(t) ? t.ru : 'Какое слово пропущено?',
        answer: pick.tok.text,
        options: [pick.tok.text, ...distractors],
        audio: '',
        speakText: '',
        ref: t.id,
      });
    });
  }

  return items;
}

/** Элементы для диктанта. source: 'sentences' | 'text' */
export function getDictationItems(unit, source = 'sentences') {
  if (!unit) return [];
  const list = source === 'text' ? unit.text || [] : unit.sentences || [];
  return list
    .filter((item) => item.target && tokenize(item.target).some((t) => t.type === 'word'))
    .map((item) => ({
      key: `dictation:${source === 'text' ? 'text' : 'sent'}-${item.id}`,
      id: item.id,
      target: item.target,
      ru: hasRealTranslation(item) ? item.ru : '',
      audio: item.audio || '',
    }));
}

/** Все ключи заданий урока — знаменатель для прогресса. */
export function getAllExerciseKeys(unit) {
  if (!unit) return [];
  return [
    ...(unit.sentences || []).map((s) => `puzzle:${s.id}`),
    ...(unit.words || []).map((w) => `speller:${w.id}`),
    ...getQuizItems(unit).map((q) => q.key),
    ...getDictationItems(unit, 'sentences').map((d) => d.key),
    ...getDictationItems(unit, 'text').map((d) => d.key),
  ];
}
