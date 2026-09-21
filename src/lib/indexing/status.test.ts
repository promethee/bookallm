// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryVectorStore } from '../storage/memory-vectors';
import { indexStatus, chunksByChapter } from './status';
import { makeIndexableBook } from './testing/books';
import { makeChapterVectors } from './testing/vector-store-contract';

const book = (counts: number[]) => makeIndexableBook(counts);

async function withSaved(
  chapters: number[],
  model = 'bge-m3:latest',
  hash = 'a'.repeat(64),
): Promise<MemoryVectorStore> {
  const store = new MemoryVectorStore();
  for (const chapter of chapters)
    await store.saveChapter(makeChapterVectors({ hash, model, chapter }));
  return store;
}

describe('indexStatus', () => {
  it.each([
    ['nothing saved', [3, 2, 4], [], 'none', 0],
    ['some chapters saved', [3, 2, 4], [1, 2], 'partial', 2],
    ['every chapter saved', [3, 2, 4], [1, 2, 3], 'complete', 3],
    ['only a later chapter saved', [3, 2, 4], [3], 'partial', 1],
  ] as const)(
    'says %s is %s',
    async (_label, counts, saved, state, chapterDone) => {
      const status = await indexStatus(
        book([...counts]),
        'bge-m3:latest',
        await withSaved([...saved]),
      );

      expect(status).toEqual({
        state,
        chapterTotal: 3,
        chapterDone,
        rebuild: false,
      });
    },
  );

  it('does not need vectors for a chapter without chunks', async () => {
    const status = await indexStatus(
      book([3, 0, 4]),
      'bge-m3:latest',
      await withSaved([1, 3]),
    );

    expect(status).toEqual({
      state: 'complete',
      chapterTotal: 2,
      chapterDone: 2,
      rebuild: false,
    });
  });

  it('counts a book with no chunks at all as indexed', async () => {
    const status = await indexStatus(
      book([0, 0]),
      'bge-m3:latest',
      new MemoryVectorStore(),
    );

    expect(status.state).toBe('complete');
    expect(status.chapterTotal).toBe(0);
  });

  it('ignores saved chapters the book does not have', async () => {
    const status = await indexStatus(
      book([2, 2]),
      'bge-m3:latest',
      await withSaved([1, 7]),
    );

    expect(status).toMatchObject({ state: 'partial', chapterDone: 1 });
  });

  it.each(['bge-m3', 'bge-m3:latest', '  BGE-M3  '])(
    'treats the configured name %j as the model saved as bge-m3:latest',
    async (configured) => {
      const status = await indexStatus(
        book([2]),
        configured,
        await withSaved([1], 'bge-m3:latest'),
      );

      expect(status.state).toBe('complete');
    },
  );

  it('does not count vectors of a different model as an index', async () => {
    const status = await indexStatus(
      book([2, 2]),
      'nomic-embed-text',
      await withSaved([1, 2], 'bge-m3:latest'),
    );

    expect(status).toEqual({
      state: 'none',
      chapterTotal: 2,
      chapterDone: 0,
      rebuild: true,
    });
  });

  it('is a rebuild while the new model is partly done, and not once it is complete', async () => {
    const store = await withSaved([1, 2], 'bge-m3:latest');
    await store.saveChapter(
      makeChapterVectors({ model: 'nomic-embed-text:latest', chapter: 1 }),
    );

    const partial = await indexStatus(book([2, 2]), 'nomic-embed-text', store);
    await store.saveChapter(
      makeChapterVectors({ model: 'nomic-embed-text:latest', chapter: 2 }),
    );
    const complete = await indexStatus(book([2, 2]), 'nomic-embed-text', store);

    expect(partial).toMatchObject({ state: 'partial', rebuild: true });
    expect(complete).toMatchObject({ state: 'complete', rebuild: false });
  });

  it('only looks at this book', async () => {
    const store = await withSaved([1, 2], 'bge-m3:latest', 'b'.repeat(64));

    const status = await indexStatus(book([2, 2]), 'bge-m3', store);

    expect(status).toMatchObject({
      state: 'none',
      chapterDone: 0,
      rebuild: false,
    });
  });
});

describe('chunksByChapter', () => {
  it('groups chunks by chapter number in chapter order and leaves out empty chapters', () => {
    const grouped = chunksByChapter([...book([2, 0, 1]).chunks].reverse());

    expect([...grouped.keys()]).toEqual([1, 3]);
    expect(grouped.get(1)).toHaveLength(2);
  });
});
