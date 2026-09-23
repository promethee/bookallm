// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeIndexableBook } from '../indexing/testing/books';
import { pickChunk } from './select';

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
});
