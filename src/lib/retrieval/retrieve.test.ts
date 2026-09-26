// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { indexBook } from '../indexing';
import { makeIndexableBook } from '../indexing/testing/books';
import type { ChapterVectors } from '../indexing/types';
import { createOllamaClient } from '../ollama';
import {
  simulateOllama,
  type OllamaState,
} from '../ollama/testing/simulated-ollama';
import { MemoryVectorStore } from '../storage/memory-vectors';
import {
  DEFAULT_PASSAGE_COUNT,
  MAX_QUESTION_LENGTH,
  RELEVANCE_CUTOFF,
} from './defaults';
import { cleanQuestion, retrievePassages } from './retrieve';
import { cosineSimilarity } from './similarity';

const HASH = 'a'.repeat(64);
const NAME = 'bge-m3:latest';

function setup(overrides: Partial<OllamaState> = {}, baseUrl?: string) {
  const state: OllamaState = {
    version: '0.34.0',
    installed: [NAME],
    ...overrides,
  };
  const fake = simulateOllama(state);
  const client = createOllamaClient({ fetch: fake.fetch, baseUrl });
  return { state, fake, client, store: new MemoryVectorStore() };
}

type Env = ReturnType<typeof setup>;

const embedRequests = (env: Env) =>
  env.fake.requests.filter((request) => request.path === '/api/embed');

/**
 * A book whose chunks have the vectors given, in book order, saved as an index for the
 * default model. Hand-made vectors make every score known in advance.
 */
async function withVectors(env: Env, counts: number[], vectors: number[][]) {
  const book = makeIndexableBook(counts, HASH);
  const dimension = vectors[0].length;
  let next = 0;
  for (const [position, count] of counts.entries()) {
    if (count === 0) continue;
    const own = vectors.slice(next, next + count);
    next += count;
    const record: ChapterVectors = {
      hash: HASH,
      model: NAME,
      chapter: position + 1,
      dimension,
      chunkIds: book.chunks
        .filter((chunk) => chunk.locator.chapterNumber === position + 1)
        .map((chunk) => chunk.id),
      vectors: Float32Array.from(own.flat()),
    };
    await env.store.saveChapter(record);
  }
  return book;
}

/** Five chunks in two chapters; with the question `[1, 0, 0]` they score 1, .6, 0, 0, -1. */
const FIVE = [
  [1, 0, 0],
  [0.6, 0.8, 0],
  [0, 1, 0],
  [0, 0, 1],
  [-1, 0, 0],
];
const ASK = { 'the question': [1, 0, 0] };

async function search(
  env: Env,
  book: ReturnType<typeof makeIndexableBook>,
  extra: Partial<Parameters<typeof retrievePassages>[0]> = {},
) {
  return retrievePassages({
    book,
    question: 'the question',
    model: 'bge-m3',
    client: env.client,
    store: env.store,
    ...extra,
  });
}

describe('retrievePassages: the best passages', () => {
  it('returns the passages best first, each with its score', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.passages.map((p) => p.chunkId)).toEqual([
      book.chunks[0].id,
      book.chunks[1].id,
      book.chunks[2].id,
      book.chunks[3].id,
      book.chunks[4].id,
    ]);
    expect(result.passages.map((p) => Number(p.score.toFixed(6)))).toEqual([
      1, 0.6, 0, 0, -1,
    ]);
  });

  it('gives each passage its text and its exact place, matching the chapter text', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { limit: 2 });

    if (result.status !== 'ok') throw new Error('expected a result');
    for (const passage of result.passages) {
      const chunk = book.chunks.find((c) => c.id === passage.chunkId)!;
      expect(passage.text).toBe(chunk.text);
      expect(passage.locator).toEqual(chunk.locator);
      const chapter = book.chapters.find(
        (c) => c.number === passage.locator.chapterNumber,
      )!;
      expect(
        chapter.text.slice(passage.locator.charStart, passage.locator.charEnd),
      ).toBe(passage.text);
      expect(passage.locator.chapterTitle).toBe(chapter.title);
    }
  });

  it('puts a chunk first when the question is that chunk’s exact text', async () => {
    // A long fake vector, so two different chunks are very unlikely to look the same.
    const env = setup({ embedDimension: 64 });
    const book = makeIndexableBook([3, 3, 3], HASH);
    await indexBook({
      book,
      model: 'bge-m3',
      client: env.client,
      store: env.store,
    });
    const target = book.chunks[5];

    const result = await search(env, book, { question: target.text });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.passages[0].chunkId).toBe(target.id);
    expect(result.passages[0].score).toBeCloseTo(1, 5);
  });

  it('breaks a tie by the chunk’s place in the book', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book);

    if (result.status !== 'ok') throw new Error('expected a result');
    const ids = result.passages.map((p) => p.chunkId);
    expect(ids.indexOf(book.chunks[2].id)).toBeLessThan(
      ids.indexOf(book.chunks[3].id),
    );
  });

  it('gives the same answer to the same question every time', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const first = await search(env, book);
    const second = await search(env, book);

    expect(second).toEqual(first);
  });

  it('finds the vectors of a book indexed under the untagged model name', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { model: 'BGE-M3' });

    expect(result.status).toBe('ok');
  });
});

describe('retrievePassages: how many passages', () => {
  const eight = Array.from({ length: 8 }, (_, i) => [1, i / 10, 0]);

  it('returns the default number when the book has more chunks', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [4, 4], eight);

    const result = await search(env, book);

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(DEFAULT_PASSAGE_COUNT).toBe(5);
    expect(result.passages).toHaveLength(DEFAULT_PASSAGE_COUNT);
  });

  it('returns the number asked for', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [4, 4], eight);

    const result = await search(env, book, { limit: 2 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.passages).toHaveLength(2);
  });

  it('returns every chunk, ranked, for a small book', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2], FIVE.slice(0, 2));

    const result = await search(env, book, { limit: 10 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.passages.map((p) => p.chunkId)).toEqual([
      book.chunks[0].id,
      book.chunks[1].id,
    ]);
  });

  it('finds nothing and sends nothing for a book without text', async () => {
    const env = setup({ embedFixed: ASK });
    const book = makeIndexableBook([0, 0], HASH);

    const result = await search(env, book);

    expect(result).toEqual({
      status: 'ok',
      verdict: 'nothing-relevant',
      passages: [],
    });
    expect(embedRequests(env)).toHaveLength(0);
  });
});

describe('retrievePassages: the relevance verdict', () => {
  // Vectors are stored as 32-bit numbers, so the score to hit exactly is computed from those.
  const at = cosineSimilarity([1, 0, 0], Float32Array.from([0.6, 0.8, 0]));

  it.each([
    ['above the cutoff', at - 0.01, 'relevant'],
    ['exactly at the cutoff', at, 'relevant'],
    ['just below the cutoff', at + 1e-9, 'nothing-relevant'],
  ] as const)(
    'is %s for a best score of 0.6: %s',
    async (_label, cutoff, expected) => {
      const env = setup({ embedFixed: ASK });
      const book = await withVectors(
        env,
        [2],
        [
          [0.6, 0.8, 0],
          [0, 1, 0],
        ],
      );

      const result = await search(env, book, { cutoff });

      if (result.status !== 'ok') throw new Error('expected a result');
      expect(result.verdict).toBe(expected);
    },
  );

  it('still returns the ranked passages when nothing is relevant', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(
      env,
      [2],
      [
        [0, 1, 0],
        [0, 0, 1],
      ],
    );

    const result = await search(env, book);

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.verdict).toBe('nothing-relevant');
    expect(result.passages).toHaveLength(2);
  });

  it('follows the best passage only, not the others', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    // The best score is 1; the others are far below any cutoff in use.
    const result = await search(env, book, { cutoff: 0.99 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.verdict).toBe('relevant');
  });

  it('uses the documented cutoff unless another is given', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(
      env,
      [1],
      [
        [
          RELEVANCE_CUTOFF + 0.05,
          Math.sqrt(1 - (RELEVANCE_CUTOFF + 0.05) ** 2),
          0,
        ],
      ],
    );
    const below = await withVectors(
      setup({ embedFixed: ASK }),
      [1],
      [
        [
          RELEVANCE_CUTOFF - 0.05,
          Math.sqrt(1 - (RELEVANCE_CUTOFF - 0.05) ** 2),
          0,
        ],
      ],
    );

    const high = await search(env, book);
    const lowEnv = setup({ embedFixed: ASK });
    await withVectors(
      lowEnv,
      [1],
      [
        [
          RELEVANCE_CUTOFF - 0.05,
          Math.sqrt(1 - (RELEVANCE_CUTOFF - 0.05) ** 2),
          0,
        ],
      ],
    );
    const low = await search(lowEnv, below);

    if (high.status !== 'ok' || low.status !== 'ok')
      throw new Error('expected results');
    expect(high.verdict).toBe('relevant');
    expect(low.verdict).toBe('nothing-relevant');
  });
});

describe('retrievePassages: the question', () => {
  it.each(['', '   ', '\n\t \n'])(
    'refuses an empty question (%j) and sends nothing',
    async (question) => {
      const env = setup({ embedFixed: ASK });
      const book = await withVectors(env, [2, 3], FIVE);

      const result = await search(env, book, { question });

      expect(result).toEqual({
        status: 'failed',
        error: { code: 'empty-question' },
      });
      expect(embedRequests(env)).toHaveLength(0);
    },
  );

  it('embeds a question with single spaces and no spaces at the ends', async () => {
    const env = setup({ embedFixed: { 'who is here': [1, 0, 0] } });
    const book = await withVectors(env, [2, 3], FIVE);

    await search(env, book, { question: '  who   is\n\there \n' });

    expect(
      (JSON.parse(embedRequests(env)[0].body!) as { input: string[] }).input,
    ).toEqual(['who is here']);
  });

  it('cuts a very long question at the limit', async () => {
    const env = setup();
    const book = await withVectors(
      env,
      [2, 3],
      FIVE.map(() => [1, 0, 0, 0, 0, 0, 0, 0]),
    );

    await search(env, book, { question: 'word '.repeat(2000) });

    const sent = (
      JSON.parse(embedRequests(env)[0].body!) as { input: string[] }
    ).input[0];
    expect(sent.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    expect(sent.length).toBeGreaterThan(MAX_QUESTION_LENGTH - 6);
  });

  it('does not split a two-unit character when it cuts', () => {
    const question = `${'a'.repeat(MAX_QUESTION_LENGTH - 1)}😀 tail`;

    const cleaned = cleanQuestion(question);

    expect(cleaned).toBe('a'.repeat(MAX_QUESTION_LENGTH - 1));
  });
});

describe('retrievePassages: a book that is not indexed', () => {
  it('fails as not indexed, without a request, when there is no index', async () => {
    const env = setup({ embedFixed: ASK });
    const book = makeIndexableBook([2, 3], HASH);

    const result = await search(env, book);

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'not-indexed' },
    });
    expect(embedRequests(env)).toHaveLength(0);
  });

  it('fails as not indexed, without a request, when the index is unfinished', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);
    await env.store.discard(HASH, NAME);
    await env.store.saveChapter({
      hash: HASH,
      model: NAME,
      chapter: 1,
      dimension: 3,
      chunkIds: [book.chunks[0].id, book.chunks[1].id],
      vectors: Float32Array.from(FIVE.slice(0, 2).flat()),
    });

    const result = await search(env, book);

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'not-indexed' },
    });
    expect(embedRequests(env)).toHaveLength(0);
  });

  it('fails as not indexed when the index was made with another model', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { model: 'nomic-embed-text' });

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'not-indexed' },
    });
    expect(embedRequests(env)).toHaveLength(0);
  });
});

describe('retrievePassages: failures', () => {
  it('reports Ollama being unreachable', async () => {
    const env = setup({ embedFixed: ASK, embedDropAfter: 0 });
    const book = await withVectors(env, [2, 3], FIVE);

    expect(await search(env, book)).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it('reports an embedding model that is not installed', async () => {
    const env = setup({ embedFixed: ASK, installed: [] });
    const book = await withVectors(env, [2, 3], FIVE);

    expect(await search(env, book)).toMatchObject({
      status: 'failed',
      error: { code: 'model-not-found' },
    });
  });

  it('reports an answer that cannot be used', async () => {
    const env = setup({ embedFixed: ASK, embedWrongCount: true });
    const book = await withVectors(env, [2, 3], FIVE);

    expect(await search(env, book)).toMatchObject({
      status: 'failed',
      error: { code: 'embed-failed' },
    });
  });

  it('reports a question vector that is not as long as the stored ones', async () => {
    const env = setup({ embedDimension: 4 });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book);

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'index-mismatch' },
    });
  });

  it('stops without an error result when aborted while waiting for Ollama', async () => {
    const env = setup({ embedStall: true });
    const book = await withVectors(env, [2, 3], FIVE);
    const controller = new AbortController();

    const pending = search(env, book, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    expect(await pending).toEqual({ status: 'aborted' });
  });

  it('turns an unexpected store error into a failure that keeps its message', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);
    class BrokenStore extends MemoryVectorStore {
      override async loadChapter(): Promise<never> {
        throw new Error('database is locked');
      }
    }
    const broken = new BrokenStore();
    for (const chapter of [1, 2]) {
      const saved = (await env.store.loadChapter(HASH, NAME, chapter))!;
      await broken.saveChapter(saved);
    }

    const result = await search(env, book, { store: broken });

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'embed-failed', detail: 'database is locked' },
    });
  });
});

describe('retrievePassages: what it touches', () => {
  it('sends the question only to the configured address', async () => {
    const env = setup({ embedFixed: ASK }, 'http://ollama.example:9999');
    const book = await withVectors(env, [2, 3], FIVE);

    await search(env, book);

    expect(env.fake.requests.map((request) => request.url)).toEqual([
      'http://ollama.example:9999/api/embed',
    ]);
  });

  it('embeds the question with the configured model', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    await search(env, book);

    expect(
      (JSON.parse(embedRequests(env)[0].body!) as { model: string }).model,
    ).toBe('bge-m3');
  });

  it('writes nothing to the store', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);
    const before = await env.store.loadChapter(HASH, NAME, 1);
    const spy = env.store;
    const writes: string[] = [];
    for (const method of [
      'saveChapter',
      'discard',
      'discardOtherModels',
    ] as const) {
      const original = spy[method].bind(spy) as (
        ...args: never[]
      ) => Promise<void>;
      spy[method] = (async (...args: never[]) => {
        writes.push(method);
        return original(...args);
      }) as never;
    }

    await search(env, book);
    await search(env, book, { question: 'something else' });

    expect(writes).toEqual([]);
    expect(await env.store.loadChapter(HASH, NAME, 1)).toEqual(before);
    expect(await env.store.modelsWithVectors(HASH)).toEqual([NAME]);
  });
});

describe('retrievePassages: restricted to one chapter', () => {
  it('returns only that chapter’s passages, best first', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { chapterNumber: 2 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.passages.map((p) => p.chunkId)).toEqual([
      book.chunks[2].id,
      book.chunks[3].id,
      book.chunks[4].id,
    ]);
    for (const passage of result.passages)
      expect(passage.locator.chapterNumber).toBe(2);
  });

  it('ignores a better match in another chapter', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { chapterNumber: 2, limit: 1 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.passages.map((p) => p.chunkId)).not.toContain(
      book.chunks[0].id,
    );
    expect(result.passages).toHaveLength(1);
  });

  it('still returns the chapter’s passages when none reaches the cutoff', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { chapterNumber: 2 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.verdict).toBe('nothing-relevant');
    expect(result.passages.length).toBeGreaterThan(0);
  });

  it('computes the verdict as usual when the chapter has a good match', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);

    const result = await search(env, book, { chapterNumber: 1 });

    if (result.status !== 'ok') throw new Error('expected a result');
    expect(result.verdict).toBe('relevant');
  });

  it('finds nothing and sends nothing for a chapter without text', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 0, 3], FIVE);

    const result = await search(env, book, { chapterNumber: 2 });

    expect(result).toEqual({
      status: 'ok',
      verdict: 'nothing-relevant',
      passages: [],
    });
    expect(embedRequests(env)).toHaveLength(0);
  });

  it('reads only that chapter’s vectors', async () => {
    const env = setup({ embedFixed: ASK });
    const book = await withVectors(env, [2, 3], FIVE);
    const loaded: number[] = [];
    const loadChapter = env.store.loadChapter.bind(env.store);
    env.store.loadChapter = (hash, model, chapter) => {
      loaded.push(chapter);
      return loadChapter(hash, model, chapter);
    };

    await search(env, book, { chapterNumber: 2 });

    expect(loaded).toEqual([2]);
  });
});
