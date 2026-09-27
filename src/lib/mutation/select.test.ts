// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeIndexableBook } from '../indexing/testing/books';
import type { Book, Chunk } from '../ingest/types';
import { isUnfitForClaim, pickChunk } from './select';

const STORY =
  'Candide was driven out of the castle by the Baron, who had caught him kissing Cunegonde behind a screen. He wandered a long time without knowing where he was going, weeping and raising his eyes to heaven.';

/** A chunk of `text` (a long story passage by default) in a chapter titled `title`. */
const chunkIn = (title: string, text = STORY, index = 0): Chunk => ({
  id: `${title}:${index}`,
  text,
  locator: {
    chapterNumber: 1,
    chapterTitle: title,
    paragraphStart: index,
    paragraphEnd: index,
    charStart: 0,
    charEnd: text.length,
  },
});

const bookOf = (chunks: Chunk[]): Book => ({
  hash: 'b'.repeat(64),
  title: 'Test',
  authors: [],
  language: 'en',
  chapters: [],
  chunks,
});

describe('pickChunk', () => {
  it('picks one of the book’s own chunks', () => {
    const book = makeIndexableBook([2, 3]);

    const result = pickChunk(book);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(book.chunks.map((chunk) => chunk.id)).toContain(result.chunk.id);
  });

  it('never picks an excluded chunk', () => {
    const book = makeIndexableBook([3]);
    const excluded = [book.chunks[0].id, book.chunks[1].id];

    for (let i = 0; i < 20; i++) {
      const result = pickChunk(book, excluded, () => i / 20);
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(excluded).not.toContain(result.chunk.id);
    }
  });

  it('reports no-chunks-available when every chunk is excluded', () => {
    const book = makeIndexableBook([2]);

    const result = pickChunk(
      book,
      book.chunks.map((chunk) => chunk.id),
    );

    expect(result).toEqual({ status: 'no-chunks-available' });
  });

  it('reports no-chunks-available for a book with no chunks', () => {
    const book = makeIndexableBook([0]);

    expect(pickChunk(book)).toEqual({ status: 'no-chunks-available' });
  });

  it('picks predictably with an injected random function', () => {
    const book = makeIndexableBook([4]);

    expect(pickChunk(book, [], () => 0)).toMatchObject({
      chunk: { id: book.chunks[0].id },
    });
    expect(pickChunk(book, [], () => 0.99)).toMatchObject({
      chunk: { id: book.chunks[3].id },
    });
  });

  it('skips front and back matter while story chunks are available', () => {
    const story = chunkIn('HOW CANDIDE WAS EXPELLED');
    const book = bookOf([
      chunkIn('INTRODUCTION BY PHILIP LITTELL'),
      story,
      chunkIn('THE FULL PROJECT GUTENBERG LICENSE'),
    ]);

    for (let i = 0; i < 10; i++)
      expect(pickChunk(book, [], () => i / 10)).toEqual({
        status: 'ok',
        chunk: story,
      });
  });

  it('falls back to every chunk when the book has nothing but front matter', () => {
    const book = bookOf([chunkIn('Preface'), chunkIn('Contents')]);

    expect(pickChunk(book, [], () => 0.99)).toMatchObject({
      chunk: { id: 'Contents:0' },
    });
  });

  it('applies exclusions after the fallback, not before it', () => {
    const story = chunkIn('CHAPTER I');
    const book = bookOf([chunkIn('INTRODUCTION'), story]);

    expect(pickChunk(book, [story.id])).toEqual({
      status: 'no-chunks-available',
    });
  });
});

describe('isUnfitForClaim', () => {
  it.each([
    'INTRODUCTION',
    'Préface',
    'Foreword',
    'Avant-propos',
    'CONTENTS',
    'Table des matières',
    'Sommaire',
    'Notes',
    "Transcriber's Note:",
    'Translator’s notes',
    'Note du traducteur',
    'FOOTNOTES:',
    'Typographical errors corrected in text:',
    'Errata',
    'Acknowledgements',
    'Remerciements',
    'Dédicace',
    'Copyright',
    'THE FULL PROJECT GUTENBERG™ LICENSE',
    'Licence',
    'À propos de l’auteur',
    'Bibliography',
    'Index',
    'Glossaire',
  ])('skips a chapter titled %j', (title) => {
    expect(isUnfitForClaim(chunkIn(title))).toBe(true);
  });

  it.each([
    'HOW CANDIDE WAS BROUGHT UP IN A MAGNIFICENT CASTLE',
    'Prologue',
    'Épilogue',
    'Appendix',
    'Notes from Underground',
    'XVI',
    'Chapter 3',
  ])('keeps a chapter titled %j', (title) => {
    expect(isUnfitForClaim(chunkIn(title))).toBe(false);
  });

  it('skips a chunk carrying the Project Gutenberg header, whatever its title', () => {
    const header = `The Project Gutenberg eBook of Candide. ${STORY}`;

    expect(isUnfitForClaim(chunkIn('Candide', header))).toBe(true);
  });

  it('skips a chunk too short to hold a fair claim', () => {
    expect(isUnfitForClaim(chunkIn('CANDIDE BY VOLTAIRE', 'CANDIDE'))).toBe(
      true,
    );
  });
});
