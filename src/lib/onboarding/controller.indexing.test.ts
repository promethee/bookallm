// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { indexBook, indexStatus } from '../indexing';
import { makeIndexableBook } from '../indexing/testing/books';
import { createOllamaClient } from '../ollama';
import {
  simulateOllama,
  type OllamaState,
} from '../ollama/testing/simulated-ollama';
import {
  MemoryLibrary,
  MemoryVectorStore,
  StorageFullError,
  type BookLibrary,
} from '../storage';
import type { ChapterVectors } from '../indexing';
import {
  bookOf,
  epub,
  file,
  harness,
  READY,
  type HarnessOptions,
} from './testing/harness';

beforeEach(() => setLanguage('en'));

/** A running Ollama with `bge-m3` and the chat model, plus a second embedding model. */
const withNomic = (extra: Partial<OllamaState> = {}): OllamaState => ({
  ...READY,
  installed: [...READY.installed, 'nomic-embed-text:latest'],
  ...extra,
});

const embedRequests = (fake: { requests: { path: string }[] }) =>
  fake.requests.filter((request) => request.path === '/api/embed');

const statusOf = async (library: BookLibrary, hash: string, model = 'bge-m3') =>
  indexStatus((await library.getBook(hash))!, model, library.vectors);

const start = (state: OllamaState, options: HarnessOptions = {}) =>
  harness(state, { language: 'en', ...options });

describe('indexing after an import', () => {
  it('indexes the new book, then shows the "Book added" summary', async () => {
    const { controller, fake, library } = await start({ ...READY });
    await controller.start();
    expect(controller.screen).toBe('import-book');

    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(controller.importState).toMatchObject({
      kind: 'imported',
      existing: false,
    });
    expect(controller.index).toBe('ready');
    expect(controller.indexState).toEqual({ kind: 'idle' });
    expect(embedRequests(fake).length).toBeGreaterThan(0);
    expect(await statusOf(library, controller.books[0].hash)).toMatchObject({
      state: 'complete',
    });
    expect(controller.screen).toBe('import-book');
    expect(controller.announcement).toEqual({
      key: 'announce.indexingDone',
      params: { title: 'Candide' },
    });

    controller.finishImport();
    expect(controller.screen).toBe('landing');
    controller.destroy();
  });

  it('shows the indexing screen with live progress while it works', async () => {
    const { controller } = await start({ ...READY, embedStall: true });
    await controller.start();

    const pending = controller.importFiles([
      file(epub('Candide'), 'candide.epub'),
    ]);

    await vi.waitFor(() => expect(controller.screen).toBe('index-book'));
    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        resumed: false,
        rebuild: false,
        progress: { chapterTotal: 1, chunksDone: 0 },
      }),
    );
    controller.destroy();
    await pending;
    expect(controller.indexState).toEqual({ kind: 'idle' });
  });

  it('indexes a recognised book that was never indexed before showing the summary', async () => {
    const a = makeIndexableBook([2, 2], 'a'.repeat(64));
    const b = await bookOf('Candide');
    const { controller, library, settings } = await start(
      { ...READY },
      { books: [b, a] },
    );
    settings.save({ activeBook: a.hash });
    await controller.start();
    // Book A was indexed at start; book B was not, as it was not the active one.
    expect(await statusOf(library, b.hash)).toMatchObject({ state: 'none' });

    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(controller.importState).toMatchObject({
      kind: 'imported',
      existing: true,
    });
    expect(await statusOf(library, b.hash)).toMatchObject({
      state: 'complete',
    });
    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });
});

describe('indexing at start', () => {
  it('indexes a book that was imported before indexing existed, then lands', async () => {
    const book = makeIndexableBook([2, 3]);
    const { controller, library, fake } = await start(
      { ...READY },
      { books: [book] },
    );

    await controller.start();

    expect(controller.screen).toBe('landing');
    expect(await statusOf(library, book.hash)).toMatchObject({
      state: 'complete',
    });
    expect(embedRequests(fake).length).toBeGreaterThan(0);
    controller.destroy();
  });

  it('sends nothing for a book that is already indexed', async () => {
    const { controller, fake } = await start(
      { ...READY },
      { books: [makeIndexableBook([2, 3])], indexed: true },
    );

    await controller.start();

    expect(controller.screen).toBe('landing');
    expect(embedRequests(fake)).toHaveLength(0);
    controller.destroy();
  });

  it('sends nothing when there is no book', async () => {
    const { controller, fake } = await start({ ...READY });

    await controller.start();

    expect(controller.screen).toBe('import-book');
    expect(embedRequests(fake)).toHaveLength(0);
    controller.destroy();
  });

  it('continues an interrupted index and says so', async () => {
    const book = makeIndexableBook([3, 3, 3]);
    const library = new MemoryLibrary();
    await library.saveBook(book);
    // An earlier session got as far as the first chapter.
    // One chunk per request: three requests save the first chapter of three chunks.
    const earlier = simulateOllama({ ...READY, embedDropAfter: 3 });
    await indexBook({
      book,
      model: 'bge-m3',
      client: createOllamaClient({ fetch: earlier.fetch }),
      store: library.vectors,
    });
    const { controller } = await start(
      { ...READY, embedStall: true },
      { library },
    );

    const started = controller.start();

    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        resumed: true,
        rebuild: false,
        progress: { chapterPosition: 2, chapterTotal: 3, chunksDone: 3 },
      }),
    );
    expect(controller.screen).toBe('index-book');
    controller.destroy();
    await started;
  });

  it('waits for a missing model to be downloaded before indexing', async () => {
    const book = makeIndexableBook([2]);
    const { controller, fake, library } = await start(
      { version: '0.34.0', installed: ['llama3.1:8b'] },
      { books: [book] },
    );

    await controller.start();
    expect(controller.screen).toBe('pull-models');
    expect(embedRequests(fake)).toHaveLength(0);

    await controller.startDownload();

    expect(controller.screen).toBe('landing');
    expect(await statusOf(library, book.hash)).toMatchObject({
      state: 'complete',
    });
    controller.destroy();
  });
});

describe('changing the embedding model', () => {
  const chat = 'llama3.1:8b';

  it('rebuilds the index with the new model and then drops the old one', async () => {
    const book = makeIndexableBook([2, 2]);
    const { controller, library } = await start(withNomic(), {
      books: [book],
      indexed: true,
    });
    await controller.start();
    expect(controller.screen).toBe('landing');

    await controller.editModels({ chat, embedding: 'nomic-embed-text' });

    expect(controller.screen).toBe('landing');
    expect(await library.vectors.modelsWithVectors(book.hash)).toEqual([
      'nomic-embed-text:latest',
    ]);
    controller.destroy();
  });

  it('says it is a rebuild while it works and keeps the old index until then', async () => {
    const book = makeIndexableBook([2, 2]);
    const state = withNomic();
    const { controller, library } = await start(state, {
      books: [book],
      indexed: true,
    });
    await controller.start();
    state.embedStall = true;

    const pending = controller.editModels({
      chat,
      embedding: 'nomic-embed-text',
    });

    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        rebuild: true,
        resumed: false,
      }),
    );
    expect(controller.screen).toBe('index-book');
    expect(await library.vectors.modelsWithVectors(book.hash)).toEqual([
      'bge-m3:latest',
    ]);
    controller.destroy();
    await pending;
  });
});

describe('when indexing fails', () => {
  it('shows the failure and does not start again by itself', async () => {
    const state = { ...READY, embedDropAfter: 0 };
    const { controller, fake } = await start(state, {
      books: [makeIndexableBook([2])],
    });

    await controller.start();

    expect(controller.screen).toBe('index-book');
    expect(controller.indexState).toMatchObject({
      kind: 'failed',
      error: { code: 'unreachable' },
    });
    expect(controller.announcement).toEqual({
      key: 'announce.indexingFailed',
      params: undefined,
    });
    const calls = embedRequests(fake).length;
    await controller.checkAgain();
    expect(embedRequests(fake)).toHaveLength(calls);
    controller.destroy();
  });

  it('reports an answer that cannot be used', async () => {
    const { controller } = await start(
      { ...READY, embedWrongCount: true },
      { books: [makeIndexableBook([2])] },
    );

    await controller.start();

    expect(controller.indexState).toMatchObject({
      kind: 'failed',
      error: { code: 'embed-failed' },
    });
    controller.destroy();
  });

  it('reports a full disk and keeps the earlier chapters', async () => {
    class FullVectors extends MemoryVectorStore {
      override async saveChapter(record: ChapterVectors): Promise<void> {
        if (record.chapter === 2) throw new StorageFullError();
        return super.saveChapter(record);
      }
    }
    const memory = new MemoryLibrary();
    const book = makeIndexableBook([2, 2, 2]);
    await memory.saveBook(book);
    const vectors = new FullVectors();
    const library: BookLibrary = {
      registry: memory.registry,
      vectors,
      saveBook: (saved) => memory.saveBook(saved),
      getBook: (hash) => memory.getBook(hash),
      close: () => undefined,
    };
    const { controller } = await start({ ...READY }, { library });

    await controller.start();

    expect(controller.indexState).toMatchObject({
      kind: 'failed',
      error: { code: 'storage-full' },
    });
    expect(
      (await vectors.savedChapters(book.hash, 'bge-m3:latest')).map(
        (saved) => saved.chapter,
      ),
    ).toEqual([1]);
    controller.destroy();
  });

  it('resumes when the reader tries again and Ollama works', async () => {
    const state: OllamaState = { ...READY, embedDropAfter: 0 };
    const book = makeIndexableBook([2, 2]);
    const { controller, library } = await start(state, { books: [book] });
    await controller.start();
    expect(controller.indexState.kind).toBe('failed');
    state.embedDropAfter = undefined;

    await controller.retryIndexing();

    expect(controller.indexState).toEqual({ kind: 'idle' });
    expect(controller.screen).toBe('landing');
    expect(await statusOf(library, book.hash)).toMatchObject({
      state: 'complete',
    });
    controller.destroy();
  });

  it('goes back to the get-Ollama screen when the reader tries again and Ollama has stopped, and resumes once it is back', async () => {
    const state: OllamaState = { ...READY, embedDropAfter: 0 };
    const book = makeIndexableBook([2, 2]);
    const { controller, library } = await start(state, { books: [book] });
    await controller.start();
    expect(controller.indexState.kind).toBe('failed');
    state.version = undefined;

    await controller.retryIndexing();

    expect(controller.screen).toBe('get-ollama');

    state.version = '0.34.0';
    state.embedDropAfter = undefined;
    await controller.checkAgain();

    expect(controller.screen).toBe('landing');
    expect(await statusOf(library, book.hash)).toMatchObject({
      state: 'complete',
    });
    controller.destroy();
  });
});

describe('stopping', () => {
  it('aborts a running index when the app is torn down and keeps what was saved', async () => {
    const book = makeIndexableBook([2, 2, 2]);
    const { controller, library } = await start(
      { ...READY, embedStall: true },
      { books: [book] },
    );
    const started = controller.start();
    await vi.waitFor(() => expect(controller.indexState.kind).toBe('running'));

    controller.destroy();
    await started;

    expect(controller.indexState).toEqual({ kind: 'idle' });
    expect(
      await library.vectors.savedChapters(book.hash, 'bge-m3:latest'),
    ).toEqual([]);
  });
});

describe('progress with every chunk', () => {
  it('moves by one chunk at a time, not in blocks', async () => {
    const { controller } = await start(
      { ...READY, embedStallAfter: 5 },
      { books: [makeIndexableBook([4, 4, 4])] },
    );
    const started = controller.start();

    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        progress: { chunksDone: 5, chunksTotal: 12 },
      }),
    );
    controller.destroy();
    await started;
  });
});

describe('the time left', () => {
  /** A clock that moves 30 seconds every time it is read, so every report is 30 s later. */
  const steppingClock = () => {
    let time = 0;
    return () => (time += 30_000);
  };

  it('says nothing before 8 chunks are done in this run', async () => {
    const book = makeIndexableBook([4, 4, 4, 4]);
    // One chunk per request: seven answer, the eighth never does.
    const { controller } = await start(
      { ...READY, embedStallAfter: 7 },
      { books: [book], now: steppingClock() },
    );
    const started = controller.start();

    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        progress: { chunksDone: 7 },
      }),
    );
    expect(
      controller.indexState.kind === 'running' &&
        controller.indexState.remainingMs,
    ).toBeUndefined();
    controller.destroy();
    await started;
  });

  it('gives an estimate from the pace once 8 chunks are done', async () => {
    const book = makeIndexableBook([4, 4, 4, 4]);
    const { controller } = await start(
      { ...READY, embedStallAfter: 8 },
      { books: [book], now: steppingClock() },
    );
    const started = controller.start();

    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        progress: { chunksDone: 8 },
      }),
    );
    const state = controller.indexState;
    // The clock moves 30 s on every report, so there is a measured pace by now, and 8
    // chunks are done in this run: the estimate is positive.
    expect(state.kind === 'running' && state.remainingMs).toBeGreaterThan(0);
    controller.destroy();
    await started;
  });

  it('counts only this run when an index resumes', async () => {
    const book = makeIndexableBook([4, 4, 4, 4, 4, 4]);
    const library = new MemoryLibrary();
    await library.saveBook(book);
    // Eight requests save the first two chapters of four chunks.
    const earlier = simulateOllama({ ...READY, embedDropAfter: 8 });
    await indexBook({
      book,
      model: 'bge-m3',
      client: createOllamaClient({ fetch: earlier.fetch }),
      store: library.vectors,
    });
    const { controller } = await start(
      { ...READY, embedStallAfter: 4 },
      { library, now: steppingClock() },
    );
    const started = controller.start();

    // 8 chunks were saved by the earlier session; only 4 are done in this run.
    await vi.waitFor(() =>
      expect(controller.indexState).toMatchObject({
        kind: 'running',
        resumed: true,
        progress: { chunksDone: 12 },
      }),
    );
    expect(
      controller.indexState.kind === 'running' &&
        controller.indexState.remainingMs,
    ).toBeUndefined();
    controller.destroy();
    await started;
  });
});
