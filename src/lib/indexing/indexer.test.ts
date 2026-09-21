// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  DEFAULT_EMBED_DIMENSION,
  fakeEmbedding,
  simulateOllama,
  type OllamaState,
} from '../ollama/testing/simulated-ollama';
import { StorageFullError } from '../storage/errors';
import { MemoryVectorStore } from '../storage/memory-vectors';
import { indexBook, type IndexBookOptions } from './indexer';
import { indexStatus } from './status';
import { makeIndexableBook } from './testing/books';
import type { ChapterVectors, IndexProgress } from './types';

const HASH = 'a'.repeat(64);

function setup(overrides: Partial<OllamaState> = {}, baseUrl?: string) {
  const state: OllamaState = {
    version: '0.34.0',
    installed: ['bge-m3:latest', 'nomic-embed-text:latest'],
    ...overrides,
  };
  const fake = simulateOllama(state);
  const client = createOllamaClient({ fetch: fake.fetch, baseUrl });
  const store = new MemoryVectorStore();
  return { state, fake, client, store };
}

type Env = ReturnType<typeof setup>;

const embedRequests = (env: Env) =>
  env.fake.requests.filter((request) => request.path === '/api/embed');
const sentTexts = (env: Env) =>
  embedRequests(env).flatMap(
    (request) => (JSON.parse(request.body!) as { input: string[] }).input,
  );
const forgetRequests = (env: Env) => {
  env.fake.requests.length = 0;
  env.state.embedCalls = 0;
};

const savedNumbers = async (env: Env, model = 'bge-m3:latest') =>
  (await env.store.savedChapters(HASH, model)).map(({ chapter }) => chapter);

function options(
  env: Env,
  counts: number[],
  overrides: Partial<IndexBookOptions> = {},
): IndexBookOptions {
  return {
    book: makeIndexableBook(counts, HASH),
    model: 'bge-m3',
    client: env.client,
    store: env.store,
    batchSize: 16,
    ...overrides,
  };
}

describe('indexBook: a full index', () => {
  it('gives every chunk exactly one vector, tied to its chunk id, all of one length', async () => {
    const env = setup();
    const book = makeIndexableBook([3, 2, 4], HASH);

    const result = await indexBook(options(env, [3, 2, 4]));

    expect(result).toEqual({ status: 'complete' });
    const saved: ChapterVectors[] = [];
    for (const chapter of [1, 2, 3])
      saved.push(
        (await env.store.loadChapter(HASH, 'bge-m3:latest', chapter))!,
      );
    expect(saved.flatMap((record) => record.chunkIds)).toEqual(
      book.chunks.map((chunk) => chunk.id),
    );
    expect(new Set(saved.map((record) => record.dimension))).toEqual(
      new Set([DEFAULT_EMBED_DIMENSION]),
    );
    const first = saved[0];
    fakeEmbedding(book.chunks[0].text).forEach((value, position) =>
      expect(first.vectors[position]).toBeCloseTo(value, 5),
    );
  });

  it('sends every chunk text exactly once', async () => {
    const env = setup();

    await indexBook(options(env, [3, 2, 4]));

    expect(sentTexts(env)).toEqual(
      makeIndexableBook([3, 2, 4], HASH).chunks.map((chunk) => chunk.text),
    );
  });

  it('splits a long chapter into batches and saves it only when all of them are in', async () => {
    const env = setup();

    await indexBook(options(env, [40]));

    expect(embedRequests(env)).toHaveLength(3);
    expect(
      embedRequests(env).map(
        (request) =>
          (JSON.parse(request.body!) as { input: string[] }).input.length,
      ),
    ).toEqual([16, 16, 8]);
    const record = await env.store.loadChapter(HASH, 'bge-m3:latest', 1);
    expect(record?.chunkIds).toHaveLength(40);
  });

  it('needs no vectors for a chapter without chunks', async () => {
    const env = setup();

    const result = await indexBook(options(env, [2, 0, 2]));

    expect(result).toEqual({ status: 'complete' });
    expect(await savedNumbers(env)).toEqual([1, 3]);
  });

  it('completes at once for a book with no chunks, sending nothing', async () => {
    const env = setup();

    expect(await indexBook(options(env, [0]))).toEqual({ status: 'complete' });
    expect(embedRequests(env)).toHaveLength(0);
  });

  it('saves under the normalised model name but asks Ollama for the configured one', async () => {
    const env = setup();

    await indexBook(options(env, [2], { model: ' bge-m3 ' }));

    expect(await env.store.modelsWithVectors(HASH)).toEqual(['bge-m3:latest']);
    expect(
      (JSON.parse(embedRequests(env)[0].body!) as { model: string }).model,
    ).toBe('bge-m3');
  });
});

describe('indexBook: text goes only to the configured address', () => {
  it('sends every request, and so every chunk text, to that address alone', async () => {
    const env = setup({}, 'http://ollama.example:9999');

    await indexBook(options(env, [2, 2]));

    expect(env.fake.requests.length).toBeGreaterThan(0);
    for (const request of env.fake.requests)
      expect(request.url).toBe('http://ollama.example:9999/api/embed');
  });
});

describe('indexBook: progress', () => {
  it('grows as work is done and never passes its totals, ending complete', async () => {
    const env = setup();
    const events: IndexProgress[] = [];

    await indexBook(
      options(env, [3, 40, 2], { onProgress: (p) => events.push(p) }),
    );

    let chunks = 0;
    let position = 1;
    for (const event of events) {
      expect(event.chunksDone).toBeGreaterThanOrEqual(chunks);
      expect(event.chapterPosition).toBeGreaterThanOrEqual(position);
      expect(event.chunksDone).toBeLessThanOrEqual(event.chunksTotal);
      expect(event.chapterPosition).toBeLessThanOrEqual(event.chapterTotal);
      chunks = event.chunksDone;
      position = event.chapterPosition;
    }
    expect(events[0]).toEqual({
      chapterPosition: 1,
      chapterTotal: 3,
      chunksDone: 0,
      chunksTotal: 45,
    });
    expect(events.at(-1)).toEqual({
      chapterPosition: 3,
      chapterTotal: 3,
      chunksDone: 45,
      chunksTotal: 45,
    });
  });

  it('starts from the saved chapters when an index resumes', async () => {
    const env = setup({ embedDropAfter: 2 });
    await indexBook(options(env, [3, 3, 3, 3, 3]));
    env.state.embedDropAfter = undefined;
    const events: IndexProgress[] = [];

    await indexBook(
      options(env, [3, 3, 3, 3, 3], { onProgress: (p) => events.push(p) }),
    );

    expect(events[0]).toEqual({
      chapterPosition: 3,
      chapterTotal: 5,
      chunksDone: 6,
      chunksTotal: 15,
    });
  });

  it('ignores a progress listener that throws', async () => {
    const env = setup();

    const result = await indexBook(
      options(env, [2], {
        onProgress: () => {
          throw new Error('listener bug');
        },
      }),
    );

    expect(result).toEqual({ status: 'complete' });
  });
});

describe('indexBook: resuming', () => {
  it('sends only the chapters that are missing and leaves saved chapters unchanged', async () => {
    const env = setup({ embedDropAfter: 2 });
    const interrupted = await indexBook(options(env, [3, 3, 3, 3, 3]));
    expect(interrupted).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
    expect(await savedNumbers(env)).toEqual([1, 2]);
    const before = await env.store.loadChapter(HASH, 'bge-m3:latest', 1);
    env.state.embedDropAfter = undefined;
    forgetRequests(env);

    const result = await indexBook(options(env, [3, 3, 3, 3, 3]));

    expect(result).toEqual({ status: 'complete' });
    const book = makeIndexableBook([3, 3, 3, 3, 3], HASH);
    expect(sentTexts(env)).toEqual(
      book.chunks
        .filter((chunk) => chunk.locator.chapterNumber >= 3)
        .map((chunk) => chunk.text),
    );
    expect(await savedNumbers(env)).toEqual([1, 2, 3, 4, 5]);
    expect(await env.store.loadChapter(HASH, 'bge-m3:latest', 1)).toEqual(
      before,
    );
  });

  it('sends nothing when the book is already indexed for the model', async () => {
    const env = setup();
    await indexBook(options(env, [2, 2]));
    forgetRequests(env);

    const result = await indexBook(options(env, [2, 2]));

    expect(result).toEqual({ status: 'complete' });
    expect(env.fake.requests).toHaveLength(0);
  });

  it('records the finished index as complete', async () => {
    const env = setup({ embedDropAfter: 1 });
    const book = makeIndexableBook([2, 2, 2], HASH);
    await indexBook(options(env, [2, 2, 2]));
    expect(await indexStatus(book, 'bge-m3', env.store)).toMatchObject({
      state: 'partial',
      chapterDone: 1,
    });
    env.state.embedDropAfter = undefined;

    await indexBook(options(env, [2, 2, 2]));

    expect(await indexStatus(book, 'bge-m3', env.store)).toMatchObject({
      state: 'complete',
    });
  });
});

describe('indexBook: stopping', () => {
  it('stops between chapters when aborted and keeps the chapters saved so far', async () => {
    const env = setup();
    const controller = new AbortController();

    const result = await indexBook(
      options(env, [3, 3, 3, 3], {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.chunksDone >= 6) controller.abort();
        },
      }),
    );

    expect(result).toEqual({ status: 'aborted' });
    expect(await savedNumbers(env)).toEqual([1, 2]);
  });

  it('stops a request that is waiting for Ollama and saves nothing of that chapter', async () => {
    const env = setup({ embedStall: true });
    const controller = new AbortController();

    const pending = indexBook(
      options(env, [3, 3], { signal: controller.signal }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    expect(await pending).toEqual({ status: 'aborted' });
    expect(await savedNumbers(env)).toEqual([]);
  });

  it('sends nothing when already aborted', async () => {
    const env = setup();

    const result = await indexBook(
      options(env, [3], { signal: AbortSignal.abort() }),
    );

    expect(result).toEqual({ status: 'aborted' });
    expect(embedRequests(env)).toHaveLength(0);
  });

  it('never saves half a chapter when a later batch fails', async () => {
    const env = setup({ embedDropAfter: 1 });

    const result = await indexBook(options(env, [40]));

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
    expect(embedRequests(env)).toHaveLength(2);
    expect(await savedNumbers(env)).toEqual([]);
  });
});

describe('indexBook: changing the embedding model', () => {
  it('deletes the old index only once the new one is complete', async () => {
    const env = setup();
    await indexBook(options(env, [2, 2]));
    env.state.embedDimension = 4;

    const result = await indexBook(
      options(env, [2, 2], { model: 'nomic-embed-text' }),
    );

    expect(result).toEqual({ status: 'complete' });
    expect(await env.store.modelsWithVectors(HASH)).toEqual([
      'nomic-embed-text:latest',
    ]);
    expect(await savedNumbers(env, 'nomic-embed-text:latest')).toEqual([1, 2]);
  });

  it('keeps the old index when the rebuild is interrupted, then finishes it later', async () => {
    const env = setup();
    await indexBook(options(env, [2, 2, 2]));
    forgetRequests(env);
    env.state.embedDropAfter = 1;
    env.state.embedDimension = 4;
    const nomic = options(env, [2, 2, 2], { model: 'nomic-embed-text' });

    const interrupted = await indexBook(nomic);

    expect(interrupted).toMatchObject({ status: 'failed' });
    expect((await env.store.modelsWithVectors(HASH)).sort()).toEqual([
      'bge-m3:latest',
      'nomic-embed-text:latest',
    ]);
    expect(await savedNumbers(env, 'bge-m3:latest')).toEqual([1, 2, 3]);
    expect(await savedNumbers(env, 'nomic-embed-text:latest')).toEqual([1]);

    env.state.embedDropAfter = undefined;
    await indexBook(nomic);
    expect(await env.store.modelsWithVectors(HASH)).toEqual([
      'nomic-embed-text:latest',
    ]);
  });

  it('cleans up an old index left behind when the new one is already complete, sending nothing', async () => {
    const env = setup();
    await indexBook(options(env, [2]));
    env.state.embedDimension = 4;
    await indexBook(options(env, [2], { model: 'nomic-embed-text' }));
    // A crash could have left the old vectors behind: put them back.
    await env.store.saveChapter({
      hash: HASH,
      model: 'bge-m3:latest',
      chapter: 1,
      dimension: 2,
      chunkIds: ['x'],
      vectors: new Float32Array(2),
    });
    forgetRequests(env);

    await indexBook(options(env, [2], { model: 'nomic-embed-text' }));

    expect(env.fake.requests).toHaveLength(0);
    expect(await env.store.modelsWithVectors(HASH)).toEqual([
      'nomic-embed-text:latest',
    ]);
  });

  it('discards saved vectors and starts again when the same model name gives a different length', async () => {
    const env = setup({ embedDropAfter: 1 });
    await indexBook(options(env, [2, 2, 2]));
    expect(await env.store.savedChapters(HASH, 'bge-m3:latest')).toEqual([
      { chapter: 1, dimension: DEFAULT_EMBED_DIMENSION },
    ]);
    env.state.embedDropAfter = undefined;
    env.state.embedDimension = 4;
    forgetRequests(env);

    const result = await indexBook(options(env, [2, 2, 2]));

    expect(result).toEqual({ status: 'complete' });
    expect(await env.store.savedChapters(HASH, 'bge-m3:latest')).toEqual([
      { chapter: 1, dimension: 4 },
      { chapter: 2, dimension: 4 },
      { chapter: 3, dimension: 4 },
    ]);
    const first = await env.store.loadChapter(HASH, 'bge-m3:latest', 1);
    expect(first?.vectors).toHaveLength(2 * 4);
  });
});

describe('indexBook: failures', () => {
  it('reports Ollama being unreachable and keeps earlier chapters', async () => {
    const env = setup({ embedDropAfter: 2 });

    const result = await indexBook(options(env, [2, 2, 2]));

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
    expect(await savedNumbers(env)).toEqual([1, 2]);
  });

  it('reports an embedding model that is not installed', async () => {
    const env = setup();

    const result = await indexBook(
      options(env, [2], { model: 'missing-model' }),
    );

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'model-not-found' },
    });
    expect(await env.store.modelsWithVectors(HASH)).toEqual([]);
  });

  it('reports an answer with the wrong number of vectors and saves nothing from it', async () => {
    const env = setup({ embedWrongCount: true });

    const result = await indexBook(options(env, [3]));

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'embed-failed' },
    });
    expect(await savedNumbers(env)).toEqual([]);
  });

  it('reports a full disk, keeps earlier chapters and does not save the failing one', async () => {
    const env = setup();
    class FullStore extends MemoryVectorStore {
      override async saveChapter(record: ChapterVectors): Promise<void> {
        if (record.chapter === 2) throw new StorageFullError();
        return super.saveChapter(record);
      }
    }
    const store = new FullStore();

    const result = await indexBook(options(env, [2, 2, 2], { store }));

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'storage-full' },
    });
    expect(
      (await store.savedChapters(HASH, 'bge-m3:latest')).map((c) => c.chapter),
    ).toEqual([1]);
  });

  it('turns an unexpected store error into a failure that keeps its message', async () => {
    const env = setup();
    class BrokenStore extends MemoryVectorStore {
      override async savedChapters(): Promise<never> {
        throw new Error('database is locked');
      }
    }

    const result = await indexBook(
      options(env, [2], { store: new BrokenStore() }),
    );

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'embed-failed', detail: 'database is locked' },
    });
  });

  it('can be run again after a failure', async () => {
    const env = setup({ embedDropAfter: 0 });
    expect(await indexBook(options(env, [2]))).toMatchObject({
      status: 'failed',
    });
    env.state.embedDropAfter = undefined;

    expect(await indexBook(options(env, [2]))).toEqual({ status: 'complete' });
  });
});
