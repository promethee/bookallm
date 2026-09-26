import type { Chapter } from '../ingest/types';

/** A well-formed Roman numeral from I to CCCXCIX, any letter case. */
const ROMAN = /^C{0,3}(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
};

/** The value of a well-formed Roman numeral, or `undefined` for anything else. */
export function parseRoman(numeral: string): number | undefined {
  if (numeral === '' || !ROMAN.test(numeral)) return undefined;
  const letters = numeral.toUpperCase();
  let total = 0;
  for (let i = 0; i < letters.length; i++) {
    const value = ROMAN_VALUES[letters[i]];
    const next = ROMAN_VALUES[letters[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

/** Digits or a Roman numeral as a positive number; `undefined` when it is neither. */
function parseNumber(text: string): number | undefined {
  if (/^\d+$/.test(text)) {
    const value = Number(text);
    return value > 0 ? value : undefined;
  }
  return parseRoman(text);
}

/**
 * "chapter", "chapitre", "chap." or "ch.", then an optional "n°" or "no.", then digits or
 * Roman-numeral letters that are not followed by another letter or digit. The number
 * group is validated separately, since a word like "civil" is made of Roman letters.
 */
const REFERENCE =
  /(?<![\p{L}\d])(?:chapter\s+|chapitre\s+|chap\.\s*|ch\.\s*)(?:(?:n°|no\.)\s*)?(\d+|[ivxlc]+)(?![\p{L}\d])/giu;

/**
 * The chapter number a message points to, such as "try chapter 7" or "regarde au
 * chapitre VII", or `undefined` when it names none. Only the words above followed by a
 * number count: number words ("seven") and bare numbers ("7") are not read as chapters.
 * When a message names several, the first is used.
 */
export function findChapterReference(message: string): number | undefined {
  for (const match of message.matchAll(REFERENCE)) {
    const value = parseNumber(match[1]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * A title that starts with its number: digits or a Roman numeral, then punctuation, a
 * space or the end ("VII. The ball", "7 - Le bal", "XII").
 */
const LEADING = /^\s*(\d+|[ivxlc]+)(?=$|[\s.:)\-—])/iu;

/** The chapter number a title carries, or `undefined` when it carries none. */
function titleNumber(title: string): number | undefined {
  const named = findChapterReference(title);
  if (named !== undefined) return named;
  const leading = LEADING.exec(title);
  if (!leading) return undefined;
  // A title such as "I Meet Him" starts with the word "I", not chapter one.
  const after = title.slice(leading.index + leading[0].length);
  if (leading[1].toUpperCase() === 'I' && /^\s/.test(after)) return undefined;
  return parseNumber(leading[1]);
}

/**
 * The chapters with text whose own title names chapter `number`, in book order. Titles
 * are used, not table-of-contents positions, because front matter such as an
 * introduction shifts the positions away from the book's own numbering. The caller
 * decides what zero or several matches mean.
 */
export function matchChapterByTitle<
  T extends Pick<Chapter, 'number' | 'title' | 'text'>,
>(chapters: readonly T[], number: number): T[] {
  return chapters.filter(
    (chapter) =>
      chapter.text.trim() !== '' && titleNumber(chapter.title) === number,
  );
}
