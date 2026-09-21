import { describe, expect, it } from 'vitest';
import type { ChapterVectors, VectorStore } from '../types';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

/** A chapter record whose numbers are easy to recognise: `seed`, `seed + 1`, and so on. */
export function makeChapterVectors(
  overrides: Partial<ChapterVectors> = {},
  seed = 1,
): ChapterVectors {
  const chunkIds = overrides.chunkIds ?? ['c:1:0', 'c:1:1'];
  const dimension = overrides.dimension ?? 3;
  return {
    hash: HASH,
    model: 'bge-m3:latest',
    chapter: 1,
    dimension,
    chunkIds,
    vectors: Float32Array.from(
      { length: chunkIds.length * dimension },
      (_, position) => seed + position,
    ),
    ...overrides,
  };
}

/**
 * Behavior every vector store must have. Run it against each implementation, as the
 * registry contract is (e.g. `runVectorStoreContract('in-memory', () => new MemoryVectorStore())`).
 */
export function runVectorStoreContract(
  name: string,
  create: () => VectorStore | Promise<VectorStore>,
): void {
  describe(`${name} vector store contract`, () => {
    it('saves a chapter and loads back exactly what was saved', async () => {
      const store = await create();
      const record = makeChapterVectors();

      await store.saveChapter(record);

      expect(await store.loadChapter(HASH, record.model, 1)).toEqual(record);
    });

    it('finds nothing for a chapter that was never saved', async () => {
      const store = await create();

      expect(await store.loadChapter(HASH, 'bge-m3:latest', 1)).toBeUndefined();
      expect(await store.savedChapters(HASH, 'bge-m3:latest')).toEqual([]);
      expect(await store.modelsWithVectors(HASH)).toEqual([]);
    });

    it('lists saved chapters in chapter order with their vector length', async () => {
      const store = await create();
      for (const chapter of [10, 2, 1])
        await store.saveChapter(makeChapterVectors({ chapter, dimension: 4 }));

      expect(await store.savedChapters(HASH, 'bge-m3:latest')).toEqual([
        { chapter: 1, dimension: 4 },
        { chapter: 2, dimension: 4 },
        { chapter: 10, dimension: 4 },
      ]);
    });

    it('replaces a chapter that is saved again', async () => {
      const store = await create();
      await store.saveChapter(makeChapterVectors({}, 1));
      const newer = makeChapterVectors({}, 100);

      await store.saveChapter(newer);

      expect(await store.loadChapter(HASH, newer.model, 1)).toEqual(newer);
      expect(await store.savedChapters(HASH, newer.model)).toHaveLength(1);
    });

    it('keeps models and books apart', async () => {
      const store = await create();
      await store.saveChapter(makeChapterVectors({ model: 'bge-m3:latest' }));
      await store.saveChapter(
        makeChapterVectors({ model: 'nomic-embed-text:latest', chapter: 2 }),
      );
      await store.saveChapter(makeChapterVectors({ hash: OTHER_HASH }));

      expect(await store.savedChapters(HASH, 'bge-m3:latest')).toEqual([
        { chapter: 1, dimension: 3 },
      ]);
      expect(
        await store.savedChapters(HASH, 'nomic-embed-text:latest'),
      ).toEqual([{ chapter: 2, dimension: 3 }]);
      expect((await store.modelsWithVectors(HASH)).sort()).toEqual([
        'bge-m3:latest',
        'nomic-embed-text:latest',
      ]);
      expect(await store.modelsWithVectors(OTHER_HASH)).toEqual([
        'bge-m3:latest',
      ]);
    });

    it('discards every chapter of one model and only that model', async () => {
      const store = await create();
      for (const chapter of [1, 2]) {
        await store.saveChapter(makeChapterVectors({ chapter }));
        await store.saveChapter(
          makeChapterVectors({ chapter, model: 'other:latest' }),
        );
      }
      await store.saveChapter(makeChapterVectors({ hash: OTHER_HASH }));

      await store.discard(HASH, 'bge-m3:latest');

      expect(await store.savedChapters(HASH, 'bge-m3:latest')).toEqual([]);
      expect(await store.savedChapters(HASH, 'other:latest')).toHaveLength(2);
      expect(
        await store.savedChapters(OTHER_HASH, 'bge-m3:latest'),
      ).toHaveLength(1);
    });

    it('discards every model except the one to keep, for that book only', async () => {
      const store = await create();
      await store.saveChapter(makeChapterVectors({ model: 'old:latest' }));
      await store.saveChapter(makeChapterVectors({ model: 'older:latest' }));
      await store.saveChapter(makeChapterVectors({ model: 'bge-m3:latest' }));
      await store.saveChapter(
        makeChapterVectors({ hash: OTHER_HASH, model: 'old:latest' }),
      );

      await store.discardOtherModels(HASH, 'bge-m3:latest');

      expect(await store.modelsWithVectors(HASH)).toEqual(['bge-m3:latest']);
      expect(await store.modelsWithVectors(OTHER_HASH)).toEqual(['old:latest']);
    });

    it('hands out copies, so callers cannot change what is stored', async () => {
      const store = await create();
      const record = makeChapterVectors();
      await store.saveChapter(record);

      record.vectors[0] = 999;
      record.chunkIds.push('extra');
      const loaded = await store.loadChapter(HASH, record.model, 1);
      loaded!.vectors[1] = 888;

      const again = await store.loadChapter(HASH, record.model, 1);
      expect(again).toEqual(makeChapterVectors());
    });

    it('stores nothing for a record that does not hold one vector per chunk', async () => {
      const store = await create();
      const broken = makeChapterVectors();
      broken.vectors = new Float32Array(broken.vectors.length - 1);

      await expect(store.saveChapter(broken)).rejects.toThrow();

      expect(await store.savedChapters(HASH, broken.model)).toEqual([]);
    });

    it.each([
      ['a chapter number that is not a whole number', { chapter: 1.5 }],
      ['a chapter number below 1', { chapter: 0 }],
      ['a vector length of zero', { dimension: 0, chunkIds: [] }],
    ])('rejects %s', async (_label, overrides) => {
      const store = await create();

      await expect(
        store.saveChapter(makeChapterVectors(overrides)),
      ).rejects.toThrow();

      expect(await store.modelsWithVectors(HASH)).toEqual([]);
    });

    it('can save again after a discard', async () => {
      const store = await create();
      await store.saveChapter(makeChapterVectors({ chapter: 1 }));
      await store.saveChapter(makeChapterVectors({ chapter: 2 }));

      await store.discard(HASH, 'bge-m3:latest');
      await store.saveChapter(makeChapterVectors({ chapter: 3 }));

      expect(await store.savedChapters(HASH, 'bge-m3:latest')).toEqual([
        { chapter: 3, dimension: 3 },
      ]);
    });
  });
}
