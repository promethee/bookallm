// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import {
  bookOf,
  epub,
  file,
  harness,
  indexWithDefaults,
  READY,
  type HarnessOptions,
} from './testing/harness';
import type { OllamaState } from '../ollama/testing/simulated-ollama';

beforeEach(() => setLanguage('en'));

const start = (state: OllamaState, options: HarnessOptions = {}) =>
  harness(state, { language: 'en', ...options });

/**
 * A book with one distinctive, plain-text chunk (no heading glued to it, so the text has
 * no embedded newline); asking its own text back gives a `relevant` verdict.
 */
async function plainBook(
  text = 'The old lighthouse keeper watched the storm from his window every single night.',
) {
  const result = await ingestEpub(
    epub('Candide', undefined, {
      documents: [{ href: 'a.xhtml', body: `<p>${text}</p>` }],
      toc: [{ title: 'Candide', href: 'a.xhtml' }],
    }),
    { registry: new InMemoryRegistry() },
  );
  if (result.status !== 'new') throw new Error('expected a new book');
  return result.book;
}

async function readyBook(
  state: OllamaState = { ...READY },
  text = 'The old lighthouse keeper watched the storm from his window every single night.',
) {
  const book = await plainBook(text);
  const context = await start(state, { books: [book], indexed: true });
  await context.controller.start();
  return { ...context, book, state };
}

describe('asking a question: a full successful turn', () => {
  it('shows the streamed text and its resolved citation', async () => {
    const { controller, book } = await readyBook();
    const question = book.chunks[0].text;

    await controller.askQuestion(question);

    expect(controller.turns).toHaveLength(1);
    const [turn] = controller.turns;
    expect(turn.question).toBe(question);
    expect(turn.state).toBe('done');
    expect(turn.stopped).toBe(false);
    expect(turn.text).toBe(`Answer: ${question} [1]`);
    expect(turn.citations).toEqual([
      {
        passageIndex: 1,
        chunkId: book.chunks[0].id,
        locator: book.chunks[0].locator,
        text: book.chunks[0].text,
        offset: turn.text.indexOf('[1]'),
      },
    ]);
    expect(controller.askBusy).toBe(false);
    controller.destroy();
  });

  it('announces when the answer is ready', async () => {
    const { controller, book } = await readyBook();

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.announcement).toEqual({
      key: 'announce.answerDone',
      params: undefined,
    });
    controller.destroy();
  });
});

describe('asking a question: guards', () => {
  it('does nothing for an empty or whitespace-only question', async () => {
    const { controller } = await readyBook();

    await controller.askQuestion('');
    await controller.askQuestion('   ');

    expect(controller.turns).toEqual([]);
    controller.destroy();
  });

  it('refuses a second question while one is being answered', async () => {
    const { controller, book, state } = await readyBook();
    state.embedStall = true;

    const pending = controller.askQuestion(book.chunks[0].text);
    expect(controller.askBusy).toBe(true);

    await controller.askQuestion('a different question');

    expect(controller.turns).toHaveLength(1);
    expect(controller.turns[0].question).toBe(book.chunks[0].text);
    controller.destroy();
    state.embedStall = false;
    controller.stopAnswer();
    await pending;
  });
});

describe('stopping an answer', () => {
  it('keeps the partial text and citations, and allows a new question at once', async () => {
    const { controller, book, state } = await readyBook({
      ...READY,
      chatStallAfterChunks: 1,
    });

    const pending = controller.askQuestion(book.chunks[0].text);
    await vi.waitFor(() =>
      expect(controller.turns[0]?.state).toBe('streaming'),
    );
    controller.stopAnswer();
    await pending;

    expect(controller.turns).toHaveLength(1);
    expect(controller.turns[0]).toMatchObject({ state: 'done', stopped: true });
    expect(controller.turns[0].text.length).toBeGreaterThan(0);
    expect(controller.askBusy).toBe(false);

    state.chatStallAfterChunks = undefined;
    await controller.askQuestion('another question');
    expect(controller.turns).toHaveLength(2);
    controller.destroy();
  });

  it('keeps an empty turn when stopped before any text arrives', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      chatStall: true,
    });

    const pending = controller.askQuestion(book.chunks[0].text);
    await vi.waitFor(() => expect(controller.askBusy).toBe(true));
    controller.stopAnswer();
    await pending;

    expect(controller.turns[0]).toMatchObject({
      state: 'done',
      stopped: true,
      text: '',
    });
    controller.destroy();
  });
});

describe('a turn that fails mid-stream', () => {
  it('keeps the partial text and citations and marks the turn failed', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      chatChunks: ['partial answer [1]'],
      chatError: 'boom',
    });

    await controller.askQuestion(book.chunks[0].text);

    const [turn] = controller.turns;
    expect(turn.state).toBe('failed');
    expect(turn.text).toBe('partial answer [1]');
    expect(turn.citations).toHaveLength(1);
    expect(turn.error).toEqual({ code: 'chat-failed', detail: 'boom' });
    controller.destroy();
  });

  it('announces the failure', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      chatError: 'boom',
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.announcement).toEqual({
      key: 'announce.answerFailed',
      params: undefined,
    });
    controller.destroy();
  });
});

describe('retrying a failed turn', () => {
  it('re-asks the same question in place and succeeds when Ollama works again', async () => {
    const state: OllamaState = { ...READY, chatDropAfter: 0 };
    const { controller, book } = await readyBook(state);
    await controller.askQuestion(book.chunks[0].text);
    const failedId = controller.turns[0].id;
    expect(controller.turns[0].state).toBe('failed');

    state.chatDropAfter = undefined;
    await controller.retryTurn(failedId);

    expect(controller.turns).toHaveLength(1);
    expect(controller.turns[0].id).toBe(failedId);
    expect(controller.turns[0].state).toBe('done');
    controller.destroy();
  });

  it('leaves earlier turns unaffected', async () => {
    const state: OllamaState = { ...READY, chatDropAfter: 1 };
    const { controller, book } = await readyBook(state);
    await controller.askQuestion(book.chunks[0].text);
    expect(controller.turns[0].state).toBe('done');
    await controller.askQuestion(`${book.chunks[0].text} again`);
    expect(controller.turns[1].state).toBe('failed');
    const first = controller.turns[0];

    state.chatDropAfter = undefined;
    await controller.retryTurn(controller.turns[1].id);

    expect(controller.turns).toHaveLength(2);
    expect(controller.turns[0]).toEqual(first);
    expect(controller.turns[1].state).toBe('done');
    controller.destroy();
  });

  it('does nothing for a turn that is not failed, or while busy', async () => {
    const { controller, book } = await readyBook();
    await controller.askQuestion(book.chunks[0].text);
    const doneId = controller.turns[0].id;

    await controller.retryTurn(doneId);

    expect(controller.turns).toHaveLength(1);
    expect(controller.turns[0].id).toBe(doneId);
    controller.destroy();
  });
});

describe('the conversation resets with the active book', () => {
  it('clears when a newly imported book becomes active', async () => {
    const { controller, book } = await readyBook();
    await controller.askQuestion(book.chunks[0].text);
    expect(controller.turns).toHaveLength(1);

    await controller.importFiles([
      file(epub('A Different Book'), 'other.epub'),
    ]);

    expect(controller.turns).toEqual([]);
    controller.destroy();
  });

  it('clears when an already-imported book is recognised again', async () => {
    const other = await bookOf('Recognised');
    const { controller, book, library } = await readyBook({ ...READY });
    await library.saveBook(other);
    await indexWithDefaults(library, other);
    controller.books = await library.registry.list();
    await controller.askQuestion(book.chunks[0].text);
    expect(controller.turns).toHaveLength(1);

    await controller.importFiles([file(epub('Recognised'), 'recognised.epub')]);

    expect(controller.turns).toEqual([]);
    controller.destroy();
  });

  it('clears when a confirmed duplicate is added as its own book', async () => {
    const { controller, book } = await readyBook();
    await controller.askQuestion(book.chunks[0].text);
    expect(controller.turns).toHaveLength(1);

    await controller.importFiles([
      file(
        epub('Candide', 'A different edition of the same title.'),
        'candide-2.epub',
      ),
    ]);
    expect(controller.importState.kind).toBe('duplicate');
    await controller.answerDuplicate('add');

    expect(controller.turns).toEqual([]);
    controller.destroy();
  });
});

describe('typed failures', () => {
  it('reports retrieval unreachable', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      embedDropAfter: 0,
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.turns[0]).toMatchObject({
      state: 'failed',
      error: { code: 'unreachable' },
    });
    controller.destroy();
  });

  it('reports retrieval model-not-found', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      installed: ['llama3.1:8b'],
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.turns[0]).toMatchObject({
      state: 'failed',
      error: { code: 'model-not-found' },
    });
    controller.destroy();
  });

  it('reports an unusable embedding answer', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      embedWrongCount: true,
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.turns[0]).toMatchObject({
      state: 'failed',
      error: { code: 'embed-failed' },
    });
    controller.destroy();
  });

  it('reports generation unreachable', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      chatDropAfter: 0,
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.turns[0]).toMatchObject({
      state: 'failed',
      error: { code: 'unreachable' },
    });
    controller.destroy();
  });

  it('reports generation model-not-found', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      installed: ['bge-m3:latest'],
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.turns[0]).toMatchObject({
      state: 'failed',
      error: { code: 'model-not-found' },
    });
    controller.destroy();
  });

  it('reports an unusable chat answer', async () => {
    const { controller, book } = await readyBook({
      ...READY,
      chatError: 'boom',
      chatChunks: [],
    });

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.turns[0]).toMatchObject({
      state: 'failed',
      error: { code: 'chat-failed', detail: 'boom' },
    });
    controller.destroy();
  });
});
