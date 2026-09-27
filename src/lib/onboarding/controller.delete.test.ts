// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import type { OllamaState } from '../ollama/testing/simulated-ollama';
import {
  bookOf,
  epub,
  file,
  harness,
  indexWithDefaults,
  READY,
  type HarnessOptions,
} from './testing/harness';

beforeEach(() => setLanguage('en'));

const MODEL = READY.installed[1];

/** An older book and a newer, active one, both indexed unless told otherwise. */
async function twoBooks(
  state: OllamaState = { ...READY },
  options: HarnessOptions = {},
) {
  const older = await bookOf('Older Book', 'The lighthouse keeper watched.');
  const newer = await bookOf('Newer Book', 'Candide reached Lisbon.');
  const context = await harness(state, {
    language: 'en',
    books: [older, newer],
    indexed: true,
    ...options,
  });
  await context.controller.start();
  return { ...context, older, newer, state };
}

async function oneBook() {
  const only = await bookOf('Only Book', 'Candide reached Lisbon.');
  const context = await harness(
    { ...READY },
    { language: 'en', books: [only], indexed: true },
  );
  await context.controller.start();
  return { ...context, only };
}

const hashes = (books: { hash: string }[]) => books.map((book) => book.hash);

describe('deleting the active book', () => {
  it('removes its record, stored text and vectors of every model', async () => {
    const { controller, library, newer } = await twoBooks();
    await library.vectors.saveChapter({
      hash: newer.hash,
      model: 'other-model:latest',
      chapter: 1,
      dimension: 2,
      chunkIds: [newer.chunks[0].id],
      vectors: Float32Array.from([1, 0]),
    });
    expect(controller.activeBook?.hash).toBe(newer.hash);

    await controller.deleteActiveBook();

    expect(hashes(await library.registry.list())).not.toContain(newer.hash);
    expect(await library.getBook(newer.hash)).toBeUndefined();
    expect(await library.vectors.modelsWithVectors(newer.hash)).toEqual([]);
    controller.destroy();
  });

  it('makes the most recent remaining book active, and says so', async () => {
    const { controller, older, settings } = await twoBooks();

    await controller.deleteActiveBook();

    expect(controller.activeBook?.hash).toBe(older.hash);
    expect(settings.load().activeBook).toBe(older.hash);
    expect(controller.bookNotice).toEqual({ title: 'Older Book' });
    expect(controller.screen).toBe('landing');
    expect(controller.deleteState).toBe('idle');
    controller.destroy();
  });

  it('shows the import screen when no book is left', async () => {
    const { controller, library } = await oneBook();

    await controller.deleteActiveBook();

    expect(await library.registry.list()).toEqual([]);
    expect(controller.activeBook).toBeUndefined();
    expect(controller.bookNotice).toBeUndefined();
    expect(controller.screen).toBe('import-book');
    controller.destroy();
  });

  it('indexes the next book when its index is unfinished', async () => {
    const older = await bookOf('Older Book', 'The lighthouse keeper watched.');
    const newer = await bookOf('Newer Book', 'Candide reached Lisbon.');
    const context = await harness(
      { ...READY },
      { language: 'en', books: [older, newer] },
    );
    // Only the newer book is indexed, so it is the one ready on the landing screen.
    await indexWithDefaults(context.library, newer);
    await context.controller.start();
    expect(context.controller.screen).toBe('landing');

    await context.controller.deleteActiveBook();

    await vi.waitFor(async () =>
      expect(
        await context.library.vectors.modelsWithVectors(older.hash),
      ).toEqual([MODEL]),
    );
    context.controller.destroy();
  });

  it('forgets the notice when another book is imported', async () => {
    const { controller } = await twoBooks();
    await controller.deleteActiveBook();
    expect(controller.bookNotice).toBeDefined();

    await controller.importFiles([file(epub('Third Book'), 'third.epub')]);

    expect(controller.bookNotice).toBeUndefined();
    controller.destroy();
  });

  it('does nothing without an active book', async () => {
    const { controller } = await oneBook();
    await controller.deleteActiveBook();

    await controller.deleteActiveBook();

    expect(controller.deleteState).toBe('idle');
    controller.destroy();
  });
});

describe('what belonged to the deleted book', () => {
  it('stops an answer being written and clears the conversation', async () => {
    const { controller, newer, state } = await twoBooks({
      ...READY,
      chatStall: true,
    });

    const pending = controller.askQuestion(newer.chunks[0].text);
    await vi.waitFor(() => expect(controller.askBusy).toBe(true));
    await controller.deleteActiveBook();
    await pending;

    expect(controller.turns).toEqual([]);
    expect(controller.askBusy).toBe(false);
    state.chatStall = false;
    controller.destroy();
  });

  it('stops a claim being generated and resets the tally', async () => {
    const { controller, state } = await twoBooks({
      ...READY,
      chatStall: true,
    });
    controller.verifyTally = { judged: 3, correct: 2 };

    const pending = controller.requestClaim();
    await vi.waitFor(() => expect(controller.verify.state).toBe('generating'));
    await controller.deleteActiveBook();
    await pending;

    expect(controller.verify.state).toBe('idle');
    expect(controller.verifyTally).toEqual({ judged: 0, correct: 0 });
    state.chatStall = false;
    controller.destroy();
  });
});

describe('a deletion that fails', () => {
  async function failing() {
    const context = await twoBooks();
    const remove = context.library.registry.remove.bind(
      context.library.registry,
    );
    context.library.registry.remove = () =>
      Promise.reject(new Error('storage refused'));
    const restore = () => (context.library.registry.remove = remove);
    return { ...context, restore };
  }

  it('keeps the book, its index and its conversation', async () => {
    const { controller, library, newer } = await failing();
    await controller.askQuestion(newer.chunks[0].text);

    await controller.deleteActiveBook();

    expect(controller.deleteState).toBe('failed');
    expect(controller.activeBook?.hash).toBe(newer.hash);
    expect(await library.getBook(newer.hash)).toBeDefined();
    expect(await library.vectors.modelsWithVectors(newer.hash)).toEqual([
      MODEL,
    ]);
    expect(controller.turns).toHaveLength(1);
    expect(controller.announcement?.key).toBe('announce.deleteFailed');
    controller.destroy();
  });

  it('succeeds when tried again', async () => {
    const { controller, older, restore } = await failing();
    await controller.deleteActiveBook();
    restore();

    await controller.deleteActiveBook();

    expect(controller.deleteState).toBe('idle');
    expect(controller.activeBook?.hash).toBe(older.hash);
    controller.destroy();
  });
});

describe('announcements', () => {
  it('names the deleted book', async () => {
    const { controller } = await twoBooks();

    await controller.deleteActiveBook();

    expect(controller.announcement).toEqual({
      key: 'announce.bookDeleted',
      params: { title: 'Newer Book' },
    });
    controller.destroy();
  });
});
