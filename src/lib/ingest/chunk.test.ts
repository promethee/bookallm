// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_SIZE,
  chunkBook,
  chunkChapter,
  fallbackSentenceRanges,
  sentenceRanges,
} from './chunk';
import { chunksOfChapter, getChapter } from './lookup';
import type { Chapter } from './types';

const HASH = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const chapter = (text: string, number = 1, title = 'Title'): Chapter => ({
  number,
  title,
  text,
});

/** A paragraph of `length` characters made of short words ending in a full stop. */
const paragraph = (length: number, word = 'lorem'): string =>
  `${(word + ' ').repeat(Math.ceil(length / (word.length + 1))).slice(0, length - 1)}.`;

describe('chunkChapter sizes and boundaries', () => {
  it('breaks at paragraph boundaries when paragraphs fit', () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `P${i} ${paragraph(296)}`,
    );
    const text = paragraphs.join('\n\n');

    const chunks = chunkChapter(chapter(text), HASH);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(DEFAULT_MAX_SIZE);
      expect(chunk.text.startsWith('P')).toBe(true);
      expect(chunk.text.endsWith('.')).toBe(true);
    }
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const text = sentence.repeat(120).trim();

    const chunks = chunkChapter(chapter(text), HASH);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(DEFAULT_MAX_SIZE);
      expect(chunk.text.startsWith('The quick')).toBe(true);
      expect(chunk.text.endsWith('dog.')).toBe(true);
    }
  });

  it('splits inside a sentence only when the sentence alone is too long', () => {
    const text = `${'word '.repeat(600)}end.`;

    const chunks = chunkChapter(chapter(text), HASH, {
      targetSize: 100,
      maxSize: 200,
    });

    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
      // Cuts land between words, so no word is broken.
      expect(chunk.text).toMatch(/^(word |end\.)/);
    }
  });

  it('hard-splits text with no whitespace at the maximum size', () => {
    const chunks = chunkChapter(chapter('x'.repeat(50)), HASH, {
      targetSize: 10,
      maxSize: 20,
    });

    expect(chunks.map((c) => c.text.length)).toEqual([20, 20, 10]);
  });

  it('makes more, smaller chunks for smaller configured sizes', () => {
    const text = Array.from({ length: 20 }, () => paragraph(300)).join('\n\n');

    const defaults = chunkChapter(chapter(text), HASH);
    const small = chunkChapter(chapter(text), HASH, {
      targetSize: 200,
      maxSize: 400,
    });

    expect(small.length).toBeGreaterThan(defaults.length);
    expect(Math.max(...small.map((c) => c.text.length))).toBeLessThanOrEqual(
      400,
    );
  });

  it('returns no chunks for an empty chapter', () => {
    expect(chunkChapter(chapter(''), HASH)).toEqual([]);
  });
});

describe('chunkChapter locators and ids', () => {
  const text = [
    'First paragraph.',
    'Second paragraph.',
    'Third paragraph.',
  ].join('\n\n');

  it('gives every chunk text equal to the chapter text at its range', () => {
    const c = chapter(text);

    for (const chunk of chunkChapter(c, HASH, {
      targetSize: 20,
      maxSize: 40,
    })) {
      expect(c.text.slice(chunk.locator.charStart, chunk.locator.charEnd)).toBe(
        chunk.text,
      );
    }
  });

  it('states chapter number, title, paragraph range and character range', () => {
    const [chunk] = chunkChapter(chapter(text, 7, 'Seven'), HASH);

    expect(chunk.locator).toEqual({
      chapterNumber: 7,
      chapterTitle: 'Seven',
      paragraphStart: 0,
      paragraphEnd: 2,
      charStart: 0,
      charEnd: text.length,
    });
  });

  it('reports the paragraph range of each chunk', () => {
    const chunks = chunkChapter(chapter(text), HASH, {
      targetSize: 10,
      maxSize: 20,
    });

    expect(
      chunks.map((c) => [c.locator.paragraphStart, c.locator.paragraphEnd]),
    ).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it('builds stable ids from the book hash, chapter and position', () => {
    const run = () =>
      chunkChapter(chapter(text, 3), HASH, { targetSize: 10, maxSize: 20 });

    expect(run().map((c) => c.id)).toEqual([
      'abcdef0123456789:3:0',
      'abcdef0123456789:3:1',
      'abcdef0123456789:3:2',
    ]);
    expect(run()).toEqual(run());
  });
});

describe('chunkBook and chapter lookup', () => {
  const chapters = [
    chapter('One one.', 1, 'One'),
    chapter('', 2, 'Plate'),
    chapter('Three three.', 3, 'Three'),
  ];
  const book = { chapters, chunks: chunkBook(chapters, HASH) };

  it('keeps every chunk inside its own chapter', () => {
    for (const chunk of book.chunks) {
      const owner = getChapter(book, chunk.locator.chapterNumber);
      expect(owner).toBeDefined();
      expect(chunk.locator.charEnd).toBeLessThanOrEqual(owner!.text.length);
      expect(
        owner!.text.slice(chunk.locator.charStart, chunk.locator.charEnd),
      ).toBe(chunk.text);
    }
  });

  it('returns a chapter and only its own chunks', () => {
    expect(getChapter(book, 3)?.text).toBe('Three three.');
    expect(chunksOfChapter(book, 3).map((c) => c.text)).toEqual([
      'Three three.',
    ]);
  });

  it('keeps a chapter with no text, numbered, with no chunks', () => {
    expect(getChapter(book, 2)).toEqual(chapters[1]);
    expect(chunksOfChapter(book, 2)).toEqual([]);
    expect(getChapter(book, 3)?.number).toBe(3);
  });

  it('returns nothing for an unknown chapter', () => {
    expect(getChapter(book, 99)).toBeUndefined();
    expect(chunksOfChapter(book, 99)).toEqual([]);
  });
});

describe('sentence splitting', () => {
  it('covers the whole text contiguously, with Intl.Segmenter or the fallback', () => {
    const text = 'One. Two! Three? Four… Five.';
    for (const ranges of [
      sentenceRanges(text, 'en'),
      fallbackSentenceRanges(text),
    ]) {
      expect(ranges[0].start).toBe(0);
      expect(ranges.at(-1)!.end).toBe(text.length);
      ranges
        .slice(1)
        .forEach((range, i) => expect(range.start).toBe(ranges[i].end));
    }
  });

  it('splits the fallback after sentence-ending punctuation', () => {
    const text = 'He said “Go.” Then left. Done';

    const sentences = fallbackSentenceRanges(text).map((r) =>
      text.slice(r.start, r.end),
    );

    expect(sentences).toEqual(['He said “Go.” ', 'Then left. ', 'Done']);
  });

  it('accepts an unrecognised language tag', () => {
    expect(() =>
      sentenceRanges('Hello there. Bye.', 'not a language'),
    ).not.toThrow();
  });
});

/** Small seeded generator so property runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'été',
  'naïve',
  'château',
  '😀',
  'Œuvre',
  'word',
  'a',
  'crème',
  '🎉🎉',
  'x'.repeat(30),
];
const ENDINGS = ['.', '!', '?', '…', '.”'];

function randomChapterText(random: () => number): string {
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const paragraphs = Array.from(
    { length: 1 + Math.floor(random() * 15) },
    () => {
      const sentences = Array.from(
        { length: 1 + Math.floor(random() * 12) },
        () => {
          const words = Array.from(
            { length: 1 + Math.floor(random() * 15) },
            () => pick(WORDS),
          );
          return `${words.join(' ')}${pick(ENDINGS)}`;
        },
      );
      return sentences.join(' ');
    },
  );
  return paragraphs.join('\n\n');
}

describe('chunkChapter properties', () => {
  const SIZES = [
    { targetSize: 10, maxSize: 12 },
    { targetSize: 50, maxSize: 80 },
    { targetSize: 200, maxSize: 400 },
    { targetSize: 1000, maxSize: 1600 },
  ];
  const LONE_SURROGATE =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it('keeps ranges exact, covers every non-whitespace character and respects the maximum', () => {
    const random = mulberry32(2024);
    for (let run = 0; run < 60; run += 1) {
      const text = randomChapterText(random);
      const sizes = SIZES[run % SIZES.length];
      const chunks = chunkChapter(chapter(text), HASH, sizes, 'fr');

      const covered = new Array<boolean>(text.length).fill(false);
      let previousEnd = 0;
      const problems: string[] = [];
      for (const chunk of chunks) {
        const { charStart, charEnd } = chunk.locator;
        if (text.slice(charStart, charEnd) !== chunk.text) {
          problems.push(`range mismatch at ${charStart}`);
        }
        if (chunk.text.length > sizes.maxSize) {
          problems.push(`chunk at ${charStart} exceeds ${sizes.maxSize}`);
        }
        if (LONE_SURROGATE.test(chunk.text)) {
          problems.push(`lone surrogate in chunk at ${charStart}`);
        }
        if (charStart < previousEnd) problems.push(`overlap at ${charStart}`);
        previousEnd = charEnd;
        for (let i = charStart; i < charEnd; i += 1) covered[i] = true;
      }
      for (let i = 0; i < text.length; i += 1) {
        if (!covered[i] && !/\s/.test(text[i])) {
          problems.push(`uncovered character at ${i}`);
        }
      }
      expect(problems, `run ${run}`).toEqual([]);
    }
  });

  it('never crosses a chapter boundary when chunking a whole book', () => {
    const random = mulberry32(7);
    const chapters = Array.from({ length: 6 }, (_, i) =>
      chapter(randomChapterText(random), i + 1, `Chapter ${i + 1}`),
    );

    const chunks = chunkBook(
      chapters,
      HASH,
      { targetSize: 200, maxSize: 400 },
      'en',
    );

    for (const chunk of chunks) {
      const owner = chapters[chunk.locator.chapterNumber - 1];
      expect(
        owner.text.slice(chunk.locator.charStart, chunk.locator.charEnd),
      ).toBe(chunk.text);
    }
    expect(new Set(chunks.map((c) => c.locator.chapterNumber))).toEqual(
      new Set(chapters.map((c) => c.number)),
    );
  });
});
