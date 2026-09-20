import type { Chapter, Chunk, ChunkingOptions } from './types';

/** Close a chunk once it holds at least this many characters. */
export const DEFAULT_TARGET_SIZE = 1000;
/** No chunk is longer than this many characters. */
export const DEFAULT_MAX_SIZE = 1600;

const PARAGRAPH_SEPARATOR = '\n\n';
const HASH_PREFIX_LENGTH = 16;

/** A half-open range `[start, end)` of the chapter text. */
interface Range {
  start: number;
  end: number;
}

/** A piece of text that is never split further: a paragraph or part of a long one. */
interface Unit extends Range {
  paragraph: number;
}

const isWhitespace = (char: string | undefined): boolean =>
  char !== undefined && /\s/.test(char);

const isHighSurrogate = (code: number): boolean =>
  code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean =>
  code >= 0xdc00 && code <= 0xdfff;

/**
 * Sentence ranges without `Intl.Segmenter`: breaks after `.`, `!`, `?` or `…` (plus any
 * closing quotes or brackets) followed by whitespace. Ranges are contiguous and cover
 * the whole text.
 */
export function fallbackSentenceRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?…]+["'”»’)\]]*\s+/g)) {
    const end = match.index + match[0].length;
    ranges.push({ start, end });
    start = end;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges;
}

/**
 * Contiguous sentence ranges covering `text`. Uses `Intl.Segmenter` for the book's
 * language when the runtime has it, otherwise a punctuation-based fallback.
 */
export function sentenceRanges(text: string, language?: string): Range[] {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return fallbackSentenceRanges(text);
  }
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(language || undefined, {
      granularity: 'sentence',
    });
  } catch {
    // An unrecognised language tag: fall back to the runtime's default rules.
    segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  }
  return Array.from(segmenter.segment(text), (part) => ({
    start: part.index,
    end: part.index + part.segment.length,
  }));
}

/**
 * Splits `[start, end)` into pieces of at most `maxSize` characters, cutting after
 * whitespace when possible and never between the halves of a surrogate pair.
 */
function hardSplit(
  text: string,
  start: number,
  end: number,
  maxSize: number,
): Range[] {
  const pieces: Range[] = [];
  let from = start;
  while (end - from > maxSize) {
    const limit = from + maxSize;
    let cut = limit;
    for (let i = limit; i > from; i -= 1) {
      if (isWhitespace(text[i - 1])) {
        cut = i;
        break;
      }
    }
    if (
      isHighSurrogate(text.charCodeAt(cut - 1)) &&
      isLowSurrogate(text.charCodeAt(cut))
    ) {
      cut -= 1;
    }
    if (cut <= from) cut = Math.min(from + 1, end);
    pieces.push({ start: from, end: cut });
    from = cut;
  }
  pieces.push({ start: from, end });
  return pieces;
}

/** Paragraphs that fit stay whole; longer ones are packed from sentences, then hard-split. */
function unitsOf(text: string, maxSize: number, language?: string): Unit[] {
  const units: Unit[] = [];
  let offset = 0;
  text.split(PARAGRAPH_SEPARATOR).forEach((paragraph, index) => {
    const start = offset;
    const end = start + paragraph.length;
    offset = end + PARAGRAPH_SEPARATOR.length;
    if (paragraph.length === 0) return;
    if (paragraph.length <= maxSize) {
      units.push({ start, end, paragraph: index });
      return;
    }

    let current: Range | undefined;
    const flush = (): void => {
      if (current) units.push({ ...current, paragraph: index });
      current = undefined;
    };
    for (const sentence of sentenceRanges(paragraph, language)) {
      const range = {
        start: start + sentence.start,
        end: start + sentence.end,
      };
      if (range.end - range.start > maxSize) {
        flush();
        for (const piece of hardSplit(text, range.start, range.end, maxSize)) {
          units.push({ ...piece, paragraph: index });
        }
      } else if (current && range.end - current.start > maxSize) {
        flush();
        current = range;
      } else {
        current = { start: current?.start ?? range.start, end: range.end };
      }
    }
    flush();
  });
  return units;
}

/**
 * Splits one chapter's text into chunks. Whole paragraphs are packed until a chunk
 * reaches the target size without ever exceeding the maximum; paragraphs longer than
 * the maximum are split at sentence boundaries, and inside a sentence only when the
 * sentence alone is too long. Chunks are contiguous and never overlap, so every
 * non-whitespace character is in exactly one chunk and locators stay exact.
 */
export function chunkChapter(
  chapter: Chapter,
  bookHash: string,
  options: ChunkingOptions = {},
  language?: string,
): Chunk[] {
  const maxSize = Math.max(1, Math.floor(options.maxSize ?? DEFAULT_MAX_SIZE));
  const targetSize = Math.min(
    maxSize,
    Math.max(1, Math.floor(options.targetSize ?? DEFAULT_TARGET_SIZE)),
  );
  const { text } = chapter;
  const idPrefix = `${bookHash.slice(0, HASH_PREFIX_LENGTH)}:${chapter.number}`;

  const groups: Unit[][] = [];
  let group: Unit[] = [];
  for (const unit of unitsOf(text, maxSize, language)) {
    if (group.length > 0 && unit.end - group[0].start > maxSize) {
      groups.push(group);
      group = [];
    }
    group.push(unit);
    if (unit.end - group[0].start >= targetSize) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length > 0) groups.push(group);

  const chunks: Chunk[] = [];
  for (const units of groups) {
    const first = units[0];
    const last = units[units.length - 1];
    // Trim edge whitespace (never book text) so chunks start and end on real characters.
    let start = first.start;
    let end = last.end;
    while (start < end && isWhitespace(text[start])) start += 1;
    while (end > start && isWhitespace(text[end - 1])) end -= 1;
    if (start === end) continue;
    chunks.push({
      id: `${idPrefix}:${chunks.length}`,
      text: text.slice(start, end),
      locator: {
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        paragraphStart: first.paragraph,
        paragraphEnd: last.paragraph,
        charStart: start,
        charEnd: end,
      },
    });
  }
  return chunks;
}

/** Chunks every chapter of a book, in chapter order. */
export function chunkBook(
  chapters: Chapter[],
  bookHash: string,
  options: ChunkingOptions = {},
  language?: string,
): Chunk[] {
  return chapters.flatMap((chapter) =>
    chunkChapter(chapter, bookHash, options, language),
  );
}
