// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLanguage, setLanguage } from '../i18n';
import { ingestEpub } from '../ingest';
import { AES_ALGORITHM, encryptionXml } from '../ingest/testing/epub-builder';
import type { OllamaState } from '../ollama/testing/simulated-ollama';
import { MemoryLibrary, StorageFullError, type BookLibrary } from '../storage';
import {
  bookOf,
  epub,
  file,
  harness,
  READY,
  versionRequests,
} from './testing/harness';

beforeEach(() => setLanguage('en'));
afterEach(() => {
  vi.useRealTimers();
});

describe('the first launch', () => {
  it('shows the language screen, preselected from the system language, and checks nothing yet', async () => {
    const { controller, fake } = await harness(READY, {
      systemLanguages: ['fr-FR', 'en'],
    });

    await controller.start();

    expect(controller.screen).toBe('language');
    expect(controller.suggestedLanguage).toBe('fr');
    expect(getLanguage()).toBe('fr');
    expect(fake.requests).toEqual([]);
    controller.destroy();
  });

  it('preselects English for any other system language', async () => {
    const { controller } = await harness(READY, { systemLanguages: ['de-DE'] });

    await controller.start();

    expect(controller.suggestedLanguage).toBe('en');
    controller.destroy();
  });

  it('only previews a language change until the reader confirms it', async () => {
    const { controller, settings } = await harness(READY);
    await controller.start();

    controller.changeLanguage('fr');

    expect(getLanguage()).toBe('fr');
    expect(settings.load().language).toBeUndefined();
    expect(controller.screen).toBe('language');

    await controller.confirmLanguage();

    expect(settings.load().language).toBe('fr');
    expect(controller.screen).not.toBe('language');
    controller.destroy();
  });

  it('moves on to the import screen once the language is confirmed and everything is ready', async () => {
    const { controller } = await harness(READY);
    await controller.start();

    await controller.confirmLanguage();

    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });
});

describe('a returning reader', () => {
  it('goes straight to the landing screen when everything is in place', async () => {
    const { controller, fake } = await harness(READY, {
      language: 'fr',
      books: [await bookOf('Candide')],
    });

    await controller.start();

    expect(controller.screen).toBe('landing');
    expect(getLanguage()).toBe('fr');
    expect(controller.activeBook?.title).toBe('Candide');
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
    controller.destroy();
  });

  it('sees the get-Ollama screen when Ollama has stopped', async () => {
    const { controller } = await harness(
      { installed: [] },
      { language: 'en', books: [await bookOf('A')] },
    );

    await controller.start();

    expect(controller.screen).toBe('get-ollama');
    controller.destroy();
  });

  it('sees the update screen when Ollama is too old', async () => {
    const { controller } = await harness(
      { version: '0.3.0', installed: [] },
      { language: 'en' },
    );

    await controller.start();

    expect(controller.screen).toBe('update-ollama');
    controller.destroy();
  });

  it('sees the download screen when a model was removed', async () => {
    const { controller } = await harness(
      { version: '0.34.0', installed: ['bge-m3:latest'] },
      { language: 'en', books: [await bookOf('A')] },
    );

    await controller.start();

    expect(controller.screen).toBe('pull-models');
    controller.destroy();
  });

  it('sees the import screen when ready with no book', async () => {
    const { controller } = await harness(READY, { language: 'en' });

    await controller.start();

    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });

  it('uses the most recently imported book when the saved active book is gone', async () => {
    const { controller, settings } = await harness(READY, {
      language: 'en',
      books: [await bookOf('First', 'One.'), await bookOf('Second', 'Two.')],
    });
    settings.save({ activeBook: 'f'.repeat(64) });

    await controller.start();

    expect(controller.activeBook?.title).toBe('Second');
    controller.destroy();
  });
});

describe('waiting screens re-check on their own', () => {
  it('moves on by itself when Ollama gets started', async () => {
    vi.useFakeTimers();
    const state: OllamaState = { installed: ['llama3.1:8b', 'bge-m3:latest'] };
    const { controller } = await harness(state, {
      language: 'en',
      books: [await bookOf('A')],
    });
    await controller.start();
    expect(controller.screen).toBe('get-ollama');

    state.version = '0.34.0';
    await vi.advanceTimersByTimeAsync(3000);

    expect(controller.screen).toBe('landing');
    controller.destroy();
  });

  it('checks again at once when asked', async () => {
    const state: OllamaState = { installed: ['llama3.1:8b', 'bge-m3:latest'] };
    const { controller } = await harness(state, {
      language: 'en',
      books: [await bookOf('A')],
    });
    await controller.start();

    state.version = '0.34.0';
    await controller.checkAgain();

    expect(controller.screen).toBe('landing');
    controller.destroy();
  });

  it('stops checking once the reader leaves the waiting screen', async () => {
    vi.useFakeTimers();
    const state: OllamaState = { installed: ['llama3.1:8b', 'bge-m3:latest'] };
    const { controller, fake } = await harness(state, {
      language: 'en',
      books: [await bookOf('A')],
    });
    await controller.start();
    state.version = '0.34.0';
    await vi.advanceTimersByTimeAsync(3000);
    expect(controller.screen).toBe('landing');
    const before = versionRequests(fake);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(versionRequests(fake)).toBe(before);
    controller.destroy();
  });

  it('keeps checking while Ollama stays down', async () => {
    vi.useFakeTimers();
    const { controller, fake } = await harness(
      { installed: [] },
      { language: 'en' },
    );
    await controller.start();
    const before = versionRequests(fake);

    await vi.advanceTimersByTimeAsync(9000);

    expect(versionRequests(fake)).toBeGreaterThan(before);
    expect(controller.screen).toBe('get-ollama');
    controller.destroy();
  });

  it('skips a check while the previous one is still running', async () => {
    vi.useFakeTimers();
    const state: OllamaState = { installed: [] };
    const { controller, fake } = await harness(state, { language: 'en' });
    await controller.start();
    const before = versionRequests(fake);
    let release!: () => void;
    state.versionGate = new Promise<void>((resolve) => (release = resolve));

    await vi.advanceTimersByTimeAsync(12_000);

    expect(versionRequests(fake) - before).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    controller.destroy();
  });

  it('stops checking after destroy', async () => {
    vi.useFakeTimers();
    const { controller, fake } = await harness(
      { installed: [] },
      { language: 'en' },
    );
    await controller.start();
    controller.destroy();
    const before = versionRequests(fake);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(versionRequests(fake)).toBe(before);
  });
});

describe('downloading models', () => {
  const MISSING_CHAT: OllamaState = {
    version: '0.34.0',
    installed: ['bge-m3:latest'],
  };

  it('downloads nothing until the reader asks', async () => {
    const { controller, fake } = await harness(MISSING_CHAT, {
      language: 'en',
    });

    await controller.start();

    expect(controller.screen).toBe('pull-models');
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false);
    controller.destroy();
  });

  it('lists what is missing, and downloads it on request, then moves on', async () => {
    const state: OllamaState = {
      ...MISSING_CHAT,
      installed: [...MISSING_CHAT.installed],
    };
    const { controller, settings } = await harness(state, { language: 'en' });
    await controller.start();
    expect(controller.readiness).toMatchObject({
      step: 'pull-models',
      plan: { items: [{ model: 'llama3.1:8b' }] },
    });

    await controller.startDownload();

    expect(controller.pull).toEqual({ status: 'idle' });
    expect(controller.screen).toBe('import-book');
    expect(controller.announcement?.key).toBe('announce.modelsReady');
    expect(settings.load()).toMatchObject({
      chatModel: 'llama3.1:8b',
      embeddingModel: 'bge-m3',
    });
    controller.destroy();
  });

  it('can cancel a download and then continue it', async () => {
    const state: OllamaState = {
      ...MISSING_CHAT,
      installed: [...MISSING_CHAT.installed],
      stallPulls: true,
    };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();

    const running = controller.startDownload();
    await vi.waitFor(() => expect(controller.pull.status).toBe('running'));
    await vi.waitFor(() =>
      expect(
        controller.pull.status === 'running' && controller.pull.progress?.phase,
      ).toBe('downloading'),
    );
    controller.cancelDownload();
    await running;

    expect(controller.pull.status).toBe('cancelled');
    expect(
      controller.pull.status === 'cancelled' &&
        controller.pull.progress?.completedBytes,
    ).toBe(30_000_000);
    expect(controller.announcement?.key).toBe('announce.downloadCancelled');

    state.stallPulls = false;
    await controller.startDownload();

    expect(controller.pull).toEqual({ status: 'idle' });
    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });

  it('reports a failure and can retry after the cause is fixed', async () => {
    const state: OllamaState = {
      ...MISSING_CHAT,
      installed: [...MISSING_CHAT.installed],
      pullErrors: { 'llama3.1:8b': 'write blob: no space left on device' },
    };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();

    await controller.startDownload();

    expect(controller.pull).toMatchObject({
      status: 'failed',
      model: 'llama3.1:8b',
      error: { code: 'insufficient-disk-space' },
    });
    expect(controller.announcement?.key).toBe('announce.downloadFailed');

    delete state.pullErrors;
    await controller.retryDownload();

    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });

  it('goes back to the get-Ollama screen when retrying after Ollama stopped', async () => {
    const state: OllamaState = {
      ...MISSING_CHAT,
      installed: [...MISSING_CHAT.installed],
      pullErrors: { 'llama3.1:8b': 'unexpected EOF' },
    };
    const { controller } = await harness(state, { language: 'en' });
    await controller.start();
    await controller.startDownload();
    expect(controller.pull.status).toBe('failed');

    state.version = undefined;
    await controller.retryDownload();

    expect(controller.screen).toBe('get-ollama');
    controller.destroy();
  });

  it('refreshes the plan when the model names are edited', async () => {
    const { controller } = await harness(
      { version: '0.34.0', installed: ['bge-m3:latest', 'qwen2.5:3b'] },
      { language: 'en' },
    );
    await controller.start();
    expect(controller.readiness?.step).toBe('pull-models');

    await controller.editModels({ chat: 'qwen2.5:3b', embedding: 'bge-m3' });

    expect(controller.readiness?.step).toBe('ready');
    controller.destroy();
  });

  it('plans a swapped model by name, with an unknown size', async () => {
    const { controller } = await harness(MISSING_CHAT, { language: 'en' });
    await controller.start();

    await controller.editModels({ chat: 'phi3:mini', embedding: 'bge-m3' });

    expect(controller.readiness).toMatchObject({
      step: 'pull-models',
      plan: { items: [{ model: 'phi3:mini' }], totalKnownBytes: 0 },
    });
    controller.destroy();
  });
});

describe('the Ollama address', () => {
  it('keeps the old address and flags an invalid one', async () => {
    const { controller, settings } = await harness(READY, { language: 'en' });
    await controller.start();

    await controller.setOllamaUrl('not a web address');

    expect(controller.addressError).toBe(true);
    expect(settings.load().ollamaUrl).toBe('http://127.0.0.1:11434');
    controller.destroy();
  });

  it('saves a valid address and uses it for the next check', async () => {
    const { controller, settings, fake } = await harness(READY, {
      language: 'en',
    });
    await controller.start();

    await controller.setOllamaUrl('http://ollama.lan:9999');

    expect(controller.addressError).toBe(false);
    expect(settings.load().ollamaUrl).toBe('http://ollama.lan:9999');
    expect(fake.requests.at(-1)?.url).toMatch(/^http:\/\/ollama\.lan:9999\//);
    controller.destroy();
  });

  it('opens the official download page for this platform', async () => {
    const { controller, opened } = await harness(
      { installed: [] },
      { language: 'en' },
    );
    await controller.start();

    const didOpen = await controller.openDownloadPage();

    expect(didOpen).toBe(true);
    expect(opened).toEqual(['https://ollama.com/download/windows']);
    controller.destroy();
  });
});

describe('importing a book', () => {
  it('imports a book, saves it and makes it the active book', async () => {
    const { controller, library, settings } = await harness(READY, {
      language: 'en',
    });
    await controller.start();

    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(controller.importState).toMatchObject({
      kind: 'imported',
      existing: false,
      book: { title: 'Candide', authors: ['Someone'], chapters: 1 },
    });
    expect(controller.books).toHaveLength(1);
    expect(controller.activeBook?.title).toBe('Candide');
    expect(settings.load().activeBook).toBe(controller.books[0].hash);
    expect(
      (await library.getBook(controller.books[0].hash))?.chapters,
    ).toHaveLength(1);
    expect(controller.announcement).toEqual({
      key: 'announce.importDone',
      params: { title: 'Candide' },
    });
    // The summary stays up until the reader continues.
    expect(controller.screen).toBe('import-book');

    controller.finishImport();
    expect(controller.screen).toBe('landing');
    controller.destroy();
  });

  it('shows the wait state before any work starts', async () => {
    let stateWhenPainting: string | undefined;
    const { controller } = await harness(READY, {
      language: 'en',
      nextFrame: async () => {
        stateWhenPainting = controller.importState.kind;
      },
    });
    await controller.start();

    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(stateWhenPainting).toBe('working');
    controller.destroy();
  });

  it('imports the first file and counts the others as skipped', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();

    await controller.importFiles([
      file(epub('One', 'First.'), 'one.epub'),
      file(epub('Two', 'Second.'), 'two.epub'),
      file(epub('Three', 'Third.'), 'three.epub'),
    ]);

    expect(controller.skippedFiles).toBe(2);
    expect(controller.books.map((b) => b.title)).toEqual(['One']);
    controller.destroy();
  });

  it('recognises a book that was already imported', async () => {
    const bytes = epub('Candide');
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    await controller.importFiles([file(bytes, 'candide.epub')]);

    await controller.importFiles([file(bytes, 'candide-again.epub')]);

    expect(controller.importState).toMatchObject({
      kind: 'imported',
      existing: true,
    });
    expect(controller.books).toHaveLength(1);
    controller.destroy();
  });

  it('asks about a possible duplicate and saves nothing until the reader adds it', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    await controller.importFiles([
      file(epub('Candide', 'Edition one.'), 'candide.epub'),
    ]);
    controller.finishImport();

    await controller.importFiles([
      file(epub('candide', 'A different edition.'), 'candide-2.epub'),
    ]);

    expect(controller.importState).toMatchObject({ kind: 'duplicate' });
    expect(
      controller.importState.kind === 'duplicate' &&
        controller.importState.candidates,
    ).toHaveLength(1);
    expect(controller.books).toHaveLength(1);
  });

  it('keeps both books when the reader adds the duplicate separately', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    await controller.importFiles([
      file(epub('Candide', 'Edition one.'), 'candide.epub'),
    ]);
    const original = controller.books[0];
    controller.finishImport();
    await controller.importFiles([
      file(epub('Candide', 'Edition two.'), 'candide-2.epub'),
    ]);

    await controller.answerDuplicate('add');

    expect(controller.books).toHaveLength(2);
    expect(controller.books[0]).toEqual(original);
    expect(controller.importState).toMatchObject({
      kind: 'imported',
      existing: false,
    });
    controller.destroy();
  });

  it('saves nothing when the reader cancels the duplicate question', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    await controller.importFiles([
      file(epub('Candide', 'Edition one.'), 'candide.epub'),
    ]);
    const original = controller.books[0];
    controller.finishImport();
    await controller.importFiles([
      file(epub('Candide', 'Edition two.'), 'candide-2.epub'),
    ]);

    await controller.answerDuplicate('cancel');

    expect(controller.books).toEqual([original]);
    expect(controller.importState).toEqual({ kind: 'idle' });
    controller.destroy();
  });

  it.each([
    [
      'a file that is not an EPUB',
      () => new TextEncoder().encode('hello'),
      'not-an-epub',
      undefined,
    ],
    [
      'a protected book',
      () =>
        epub('P', 'Text.', { files: { 'META-INF/rights.xml': '<rights/>' } }),
      'drm-locked',
      'adobe',
    ],
    [
      'a book with encrypted content',
      () =>
        epub('P', 'Text.', {
          files: { 'META-INF/encryption.xml': encryptionXml([AES_ALGORITHM]) },
        }),
      'drm-locked',
      'unknown',
    ],
    [
      'an image-only book',
      () =>
        epub('I', '', {
          documents: [{ href: 'a.xhtml', body: '<img src="x.png" alt=""/>' }],
        }),
      'no-text-content',
      undefined,
    ],
    [
      'a damaged EPUB',
      () => epub('D', 'x', { files: { 'OEBPS/content.opf': null } }),
      'malformed-epub',
      undefined,
    ],
  ])('reports %s', async (_name, make, code, scheme) => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();

    await controller.importFiles([file(make())]);

    expect(controller.importState).toEqual({ kind: 'error', code, scheme });
    expect(controller.books).toHaveLength(0);
    expect(controller.announcement?.key).toBe('announce.importFailed');
    controller.destroy();
  });

  it('reports an unreadable file as damaged', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    const unreadable = {
      name: 'x.epub',
      arrayBuffer: () => Promise.reject(new Error('disk')),
    } as unknown as File;

    await controller.importFiles([unreadable]);

    expect(controller.importState).toEqual({
      kind: 'error',
      code: 'malformed-epub',
    });
    controller.destroy();
  });

  it('lets the reader try another file after an error', async () => {
    const { controller } = await harness(READY, { language: 'en' });
    await controller.start();
    await controller.importFiles([file(new TextEncoder().encode('hello'))]);

    controller.tryAnotherFile();
    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(controller.importState.kind).toBe('imported');
    controller.destroy();
  });

  it('says the book could not be saved and leaves nothing half-saved when there is no room', async () => {
    const memory = new MemoryLibrary();
    const full: BookLibrary = {
      registry: memory.registry,
      saveBook: () => Promise.reject(new StorageFullError()),
      getBook: (hash) => memory.getBook(hash),
      close: () => undefined,
    };
    const { controller } = await harness(READY, {
      language: 'en',
      library: full,
    });
    await controller.start();

    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(controller.importState).toEqual({
      kind: 'save-failed',
      reason: 'full',
    });
    expect(controller.books).toHaveLength(0);
    expect(await memory.registry.list()).toEqual([]);
    controller.destroy();
  });

  it('reports other save failures too', async () => {
    const memory = new MemoryLibrary();
    const broken: BookLibrary = {
      registry: memory.registry,
      saveBook: () => Promise.reject(new Error('boom')),
      getBook: (hash) => memory.getBook(hash),
      close: () => undefined,
    };
    const { controller } = await harness(READY, {
      language: 'en',
      library: broken,
    });
    await controller.start();

    await controller.importFiles([file(epub('Candide'), 'candide.epub')]);

    expect(controller.importState).toEqual({
      kind: 'save-failed',
      reason: 'other',
    });
    controller.destroy();
  });

  it('ignores a second import while one is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ingest = vi.fn(async (...args: Parameters<typeof ingestEpub>) => {
      await gate;
      return ingestEpub(...args);
    });
    const { controller } = await harness(READY, { language: 'en', ingest });
    await controller.start();

    const first = controller.importFiles([file(epub('One'), 'one.epub')]);
    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    await controller.importFiles([file(epub('Two', 'Other.'), 'two.epub')]);
    release();
    await first;

    expect(ingest).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});

describe('postponing and requesting the import', () => {
  it('goes to the landing screen for the session, and asks again on the next launch', async () => {
    const first = await harness(READY, { language: 'en' });
    await first.controller.start();
    expect(first.controller.screen).toBe('import-book');

    first.controller.postponeImport();

    expect(first.controller.screen).toBe('landing');
    expect(first.controller.activeBook).toBeUndefined();
    first.controller.destroy();

    const next = await harness(READY, { language: 'en' });
    await next.controller.start();
    expect(next.controller.screen).toBe('import-book');
    next.controller.destroy();
  });

  it('opens the import screen from the landing screen and returns to it', async () => {
    const { controller } = await harness(READY, {
      language: 'en',
      books: [await bookOf('A')],
    });
    await controller.start();
    expect(controller.screen).toBe('landing');

    controller.requestImport();
    expect(controller.screen).toBe('import-book');

    controller.finishImport();
    expect(controller.screen).toBe('landing');
    controller.destroy();
  });
});

describe('the language after the first choice', () => {
  it('is saved when changed', async () => {
    const { controller, settings } = await harness(READY, {
      language: 'en',
      books: [await bookOf('A')],
    });
    await controller.start();

    controller.changeLanguage('fr');

    expect(getLanguage()).toBe('fr');
    expect(settings.load().language).toBe('fr');
    controller.destroy();
  });

  it('does not change the models or start any download', async () => {
    const { controller, settings, fake } = await harness(READY, {
      language: 'en',
      books: [await bookOf('A')],
    });
    await controller.start();
    const requests = fake.requests.length;

    controller.changeLanguage('fr');

    expect(settings.load()).toMatchObject({
      chatModel: 'llama3.1:8b',
      embeddingModel: 'bge-m3',
    });
    expect(fake.requests.length).toBe(requests);
    controller.destroy();
  });
});
