// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { epub, harness, READY } from './testing/harness';
import {
  DEFAULT_EMBED_DIMENSION,
  type OllamaState,
} from '../ollama/testing/simulated-ollama';

beforeEach(() => setLanguage('en'));

const INTRO = 'A note on the printing history of this translation.';
const FIRST = 'The old lighthouse keeper watched the storm from his window.';
const SECOND =
  'Candide reached Lisbon just before the earthquake struck the city.';
const UNRELATED = 'zebra quantum xylophone';

/**
 * An introduction, then "Chapter 1" and "Chapter 2": the table-of-contents positions (1,
 * 2, 3) do not match the book's own chapter numbers, as in many real editions.
 */
async function threePartBook(
  titles = ['Introduction', 'Chapter 1', 'Chapter 2'],
  texts = [INTRO, FIRST, SECOND],
) {
  const result = await ingestEpub(
    epub('Candide', undefined, {
      documents: [
        { href: 'a.xhtml', body: `<p>${texts[0]}</p>` },
        { href: 'b.xhtml', body: `<p>${texts[1]}</p>` },
        { href: 'c.xhtml', body: `<p>${texts[2]}</p>` },
      ],
      toc: [
        { title: titles[0], href: 'a.xhtml' },
        { title: titles[1], href: 'b.xhtml' },
        { title: titles[2], href: 'c.xhtml' },
      ],
    }),
    { registry: new InMemoryRegistry() },
  );
  if (result.status !== 'new') throw new Error('expected a new book');
  return result.book;
}

/**
 * Fake embeddings never have a negative entry, so a question vector with only negative
 * entries scores at most 0 against every passage: nothing is ever relevant to it.
 */
const AWAY = new Array<number>(DEFAULT_EMBED_DIMENSION).fill(
  -1 / Math.sqrt(DEFAULT_EMBED_DIMENSION),
);

async function nothingFound(
  overrides: Partial<OllamaState> = {},
  titles?: string[],
  texts?: string[],
) {
  const state: OllamaState = {
    ...READY,
    embedFixed: { [UNRELATED]: AWAY },
    ...overrides,
  };
  const book = await threePartBook(titles, texts);
  const context = await harness(state, {
    language: 'en',
    books: [book],
    indexed: true,
  });
  await context.controller.start();
  await context.controller.askQuestion(UNRELATED);
  const [turn] = context.controller.turns;
  if (turn.verdict !== 'nothing-relevant')
    throw new Error(`expected nothing to be found: ${JSON.stringify(turn)}`);
  return { ...context, book, state, turn };
}

/** What the model said in the real-world check: a marker that resolves to no passage. */
const UNCITED =
  'There is no mention of a dog in any of the passages provided[None]';

/**
 * A question whose search finds relevant passages, answered with `reply`, which cites
 * nothing unless told otherwise.
 */
async function uncitedAnswer(reply: string[] = [UNCITED]) {
  const state: OllamaState = { ...READY, chatChunks: reply };
  const book = await threePartBook();
  const context = await harness(state, {
    language: 'en',
    books: [book],
    indexed: true,
  });
  await context.controller.start();
  await context.controller.askQuestion(FIRST);
  const [turn] = context.controller.turns;
  if (turn.verdict !== 'relevant')
    throw new Error(`expected relevant passages: ${JSON.stringify(turn)}`);
  return { ...context, book, state, turn };
}

describe('an answer that cites no passage', () => {
  it('is recoverable when its only marker resolves to no passage', async () => {
    const { controller, turn } = await uncitedAnswer();

    expect(turn).toMatchObject({ state: 'done', text: UNCITED, citations: [] });
    expect(controller.canRecover(turn)).toBe(true);
    expect(controller.chapterChoices).toEqual([
      { number: 1, title: 'Introduction' },
      { number: 2, title: 'Chapter 1' },
      { number: 3, title: 'Chapter 2' },
    ]);
    controller.destroy();
  });

  it('is recoverable when it has no marker at all', async () => {
    const { controller, turn } = await uncitedAnswer([
      'The passages do not say.',
    ]);

    expect(controller.canRecover(turn)).toBe(true);
    controller.destroy();
  });

  it('is not recoverable once one citation resolves', async () => {
    const { controller, turn } = await uncitedAnswer([
      'The keeper watched the storm [1] and the rest is unclear [None].',
    ]);

    expect(turn.citations.length).toBeGreaterThan(0);
    expect(controller.canRecover(turn)).toBe(false);
    controller.destroy();
  });

  it('is not recoverable when stopped before it finished', async () => {
    const state: OllamaState = {
      ...READY,
      chatChunks: ['The passages ', 'do not say.'],
      chatStallAfterChunks: 1,
    };
    const context = await harness(state, {
      language: 'en',
      books: [await threePartBook()],
      indexed: true,
    });
    const { controller } = context;
    await controller.start();

    const pending = controller.askQuestion(FIRST);
    await vi.waitFor(() =>
      expect(controller.turns[0]?.state).toBe('streaming'),
    );
    controller.stopAnswer();
    await pending;

    expect(controller.turns[0]).toMatchObject({ stopped: true, citations: [] });
    expect(controller.canRecover(controller.turns[0])).toBe(false);
    controller.destroy();
  });

  it('is not recoverable when it failed', async () => {
    const state: OllamaState = { ...READY, chatError: 'boom' };
    const context = await harness(state, {
      language: 'en',
      books: [await threePartBook()],
      indexed: true,
    });
    const { controller } = context;
    await controller.start();

    await controller.askQuestion(FIRST);

    expect(controller.turns[0].state).toBe('failed');
    expect(controller.canRecover(controller.turns[0])).toBe(false);
    controller.destroy();
  });

  it('is retried in a chosen chapter, once', async () => {
    const { controller, turn, state } = await uncitedAnswer();
    state.chatChunks = undefined;

    await controller.retryInChapter(turn.id, 3);
    await controller.retryInChapter(turn.id, 2);

    expect(controller.turns).toHaveLength(2);
    expect(controller.turns[0].recovered).toBe(true);
    expect(controller.turns[1]).toMatchObject({
      kind: 'chapter-retry',
      question: FIRST,
      chapter: { number: 3, title: 'Chapter 2' },
      retryOf: turn.id,
      state: 'done',
    });
    for (const citation of controller.turns[1].citations)
      expect(citation.locator.chapterNumber).toBe(3);
    controller.destroy();
  });

  it('never makes a chapter retry that cites nothing recoverable itself', async () => {
    const { controller, turn, book } = await uncitedAnswer();

    await controller.retryInChapter(turn.id, 3);

    const retry = controller.turns[1];
    expect(retry.citations).toEqual([]);
    expect(retry.handedOver).toBe(book.chapters[2].text);
    expect(controller.canRecover(retry)).toBe(false);
    controller.destroy();
  });

  it('takes a typed chapter as a hint for its question', async () => {
    const { controller, turn } = await uncitedAnswer();

    await controller.askQuestion('try chapter 2');

    expect(controller.turns[1]).toMatchObject({
      kind: 'chapter-retry',
      question: FIRST,
      retryOf: turn.id,
      chapter: { number: 3, title: 'Chapter 2' },
    });
    controller.destroy();
  });

  it('says the chapter is unclear, then accepts a second typed try', async () => {
    const { controller, turn } = await uncitedAnswer();

    await controller.askQuestion('try chapter 9');
    expect(controller.turns[1]).toMatchObject({
      kind: 'hint-unclear',
      retryOf: turn.id,
    });

    await controller.askQuestion('chapter 1 then');
    expect(controller.turns[2]).toMatchObject({
      kind: 'chapter-retry',
      question: FIRST,
      retryOf: turn.id,
      chapter: { number: 2, title: 'Chapter 1' },
    });
    controller.destroy();
  });

  it('asks a chapter mention after a cited answer as a new question', async () => {
    const { controller, state } = await uncitedAnswer();
    state.chatChunks = undefined;
    await controller.askQuestion(SECOND);
    expect(controller.turns[1].citations.length).toBeGreaterThan(0);

    await controller.askQuestion('what happens in chapter 2?');

    expect(controller.turns[2]).toMatchObject({
      kind: 'question',
      question: 'what happens in chapter 2?',
    });
    controller.destroy();
  });
});

describe('the chapters offered after nothing is found', () => {
  it('lists the chapters with text, by title, in book order', async () => {
    const { controller } = await nothingFound();

    expect(controller.chapterChoices).toEqual([
      { number: 1, title: 'Introduction' },
      { number: 2, title: 'Chapter 1' },
      { number: 3, title: 'Chapter 2' },
    ]);
    controller.destroy();
  });

  it('can recover a nothing-found turn, but not an answered one', async () => {
    const { controller, turn, book } = await nothingFound();
    expect(controller.canRecover(turn)).toBe(true);

    await controller.askQuestion(book.chunks[0].text);

    expect(controller.canRecover(controller.turns[1])).toBe(false);
    controller.destroy();
  });
});

describe('retrying in a chosen chapter', () => {
  it('adds a retry turn that names the chapter and the original question', async () => {
    const { controller, turn } = await nothingFound();

    await controller.retryInChapter(turn.id, 3);

    expect(controller.turns).toHaveLength(2);
    expect(controller.turns[1]).toMatchObject({
      kind: 'chapter-retry',
      question: UNRELATED,
      chapter: { number: 3, title: 'Chapter 2' },
      retryOf: turn.id,
      state: 'done',
    });
    controller.destroy();
  });

  it('answers from that chapter only, even below the relevance cutoff', async () => {
    const { controller, turn, book, state } = await nothingFound();
    state.chatCalls = 0;

    await controller.retryInChapter(turn.id, 3);

    const retry = controller.turns[1];
    expect(state.chatCalls).toBe(1);
    expect(retry.citations.length).toBeGreaterThan(0);
    for (const citation of retry.citations)
      expect(citation.locator.chapterNumber).toBe(3);
    expect(retry.citations[0].text).toBe(
      book.chunks.find((chunk) => chunk.locator.chapterNumber === 3)!.text,
    );
    expect(retry.handedOver).toBeUndefined();
    controller.destroy();
  });

  it('marks the nothing-found turn recovered, and never retries it twice', async () => {
    const { controller, turn } = await nothingFound();

    await controller.retryInChapter(turn.id, 3);
    await controller.retryInChapter(turn.id, 2);

    expect(controller.turns).toHaveLength(2);
    expect(controller.turns[0].recovered).toBe(true);
    expect(controller.canRecover(controller.turns[0])).toBe(false);
    controller.destroy();
  });

  it('ignores a chapter that is not one of the choices', async () => {
    const { controller, turn } = await nothingFound();

    await controller.retryInChapter(turn.id, 9);

    expect(controller.turns).toHaveLength(1);
    expect(controller.turns[0].recovered).toBeUndefined();
    controller.destroy();
  });

  it('refuses while a question is being answered', async () => {
    const { controller, turn, state } = await nothingFound();
    state.chatStall = true;

    const pending = controller.retryInChapter(turn.id, 3);
    await vi.waitFor(() => expect(controller.askBusy).toBe(true));
    await controller.retryInChapter(turn.id, 2);

    expect(controller.turns).toHaveLength(2);
    controller.stopAnswer();
    await pending;
    controller.destroy();
  });
});

describe('handing over the chapter', () => {
  it('shows the chapter text when the retry’s answer cites nothing', async () => {
    const { controller, turn, book, state } = await nothingFound();
    state.chatChunks = ['These passages do not say.'];

    await controller.retryInChapter(turn.id, 3);

    const retry = controller.turns[1];
    expect(retry.text).toBe('These passages do not say.');
    expect(retry.citations).toEqual([]);
    expect(retry.handedOver).toBe(book.chapters[2].text);
    expect(controller.announcement?.key).toBe('announce.chapterShown');
    controller.destroy();
  });

  it('offers nothing more for that question afterwards', async () => {
    const { controller, turn, state } = await nothingFound();
    state.chatChunks = ['These passages do not say.'];

    await controller.retryInChapter(turn.id, 3);
    await controller.askQuestion('try chapter 1');

    expect(controller.turns[2]).toMatchObject({
      kind: 'question',
      question: 'try chapter 1',
    });
    controller.destroy();
  });

  it('does not hand over a stopped retry', async () => {
    const { controller, turn, state } = await nothingFound({
      chatStallAfterChunks: 1,
    });

    const pending = controller.retryInChapter(turn.id, 3);
    await vi.waitFor(() =>
      expect(controller.turns[1]?.state).toBe('streaming'),
    );
    controller.stopAnswer();
    await pending;

    expect(controller.turns[1]).toMatchObject({ state: 'done', stopped: true });
    expect(controller.turns[1].handedOver).toBeUndefined();
    state.chatStallAfterChunks = undefined;
    controller.destroy();
  });

  it('does not hand over a failed retry, and retries the same chapter in place', async () => {
    const { controller, turn, state } = await nothingFound();
    state.chatError = 'boom';

    await controller.retryInChapter(turn.id, 3);
    const failed = controller.turns[1];
    expect(failed.state).toBe('failed');
    expect(failed.handedOver).toBeUndefined();

    state.chatError = undefined;
    await controller.retryTurn(failed.id);

    expect(controller.turns).toHaveLength(2);
    expect(controller.turns[1]).toMatchObject({
      id: failed.id,
      kind: 'chapter-retry',
      chapter: { number: 3, title: 'Chapter 2' },
      state: 'done',
    });
    expect(controller.turns[1].citations.length).toBeGreaterThan(0);
    controller.destroy();
  });
});

describe('a typed chapter hint', () => {
  it('retries in the chapter whose title names that number, not its position', async () => {
    const { controller } = await nothingFound();

    await controller.askQuestion('try chapter 2');

    expect(controller.turns[1]).toMatchObject({
      kind: 'chapter-retry',
      question: UNRELATED,
      chapter: { number: 3, title: 'Chapter 2' },
    });
    controller.destroy();
  });

  it('reads French and Roman numerals', async () => {
    const { controller } = await nothingFound(undefined, [
      'Introduction',
      'Chapitre I',
      'Chapitre II',
    ]);

    await controller.askQuestion('regarde au chapitre I');

    expect(controller.turns[1]).toMatchObject({
      kind: 'chapter-retry',
      chapter: { number: 2, title: 'Chapitre I' },
    });
    controller.destroy();
  });

  it('says which chapter is unclear when no title matches, without retrying', async () => {
    const { controller, turn, state } = await nothingFound();
    state.chatCalls = 0;

    await controller.askQuestion('try chapter 9');

    expect(controller.turns[1]).toMatchObject({
      kind: 'hint-unclear',
      question: 'try chapter 9',
      retryOf: turn.id,
      state: 'done',
    });
    expect(state.chatCalls).toBe(0);
    expect(controller.canRecover(controller.turns[0])).toBe(true);
    expect(controller.announcement?.key).toBe('announce.chapterUnclear');
    controller.destroy();
  });

  it('says which chapter is unclear when several titles match', async () => {
    const { controller } = await nothingFound(undefined, [
      'Introduction',
      'Part One, Chapter 1',
      'Part Two, Chapter 1',
    ]);

    await controller.askQuestion('chapter 1');

    expect(controller.turns[1].kind).toBe('hint-unclear');
    controller.destroy();
  });

  it('accepts a second typed try after an unclear one', async () => {
    const { controller, turn } = await nothingFound();

    await controller.askQuestion('try chapter 9');
    await controller.askQuestion('chapter 1 then');

    expect(controller.turns[2]).toMatchObject({
      kind: 'chapter-retry',
      retryOf: turn.id,
      chapter: { number: 2, title: 'Chapter 1' },
    });
    controller.destroy();
  });

  it('is an ordinary question after a turn that found something', async () => {
    const { controller, book } = await nothingFound();
    await controller.askQuestion(book.chunks[0].text);

    await controller.askQuestion('what happens in chapter 2?');

    expect(controller.turns[2]).toMatchObject({
      kind: 'question',
      question: 'what happens in chapter 2?',
    });
    controller.destroy();
  });

  it('is an ordinary question when it names no chapter', async () => {
    const { controller } = await nothingFound();

    await controller.askQuestion('what about the lighthouse?');

    expect(controller.turns[1]).toMatchObject({ kind: 'question' });
    expect(controller.canRecover(controller.turns[0])).toBe(true);
    controller.destroy();
  });
});

describe('announcements', () => {
  it('announces a retry that answers like any answer', async () => {
    const { controller, turn } = await nothingFound();

    await controller.retryInChapter(turn.id, 3);

    expect(controller.announcement?.key).toBe('announce.answerDone');
    controller.destroy();
  });

  it('announces a retry that fails like any failure', async () => {
    const { controller, turn, state } = await nothingFound();
    state.chatError = 'boom';

    await controller.retryInChapter(turn.id, 3);

    expect(controller.announcement?.key).toBe('announce.answerFailed');
    controller.destroy();
  });
});

describe('a book whose chapter numbers are headings of their own', () => {
  // As in the Gutenberg Candide: "V" is an entry holding only its heading, and the
  // chapter's text is in the entry after it.
  const titles = ['Introduction', 'V', 'TEMPEST, SHIPWRECK, EARTHQUAKE'];
  const texts = [INTRO, 'V', SECOND];

  it('does not offer the heading-only entry', async () => {
    const { controller } = await nothingFound({}, titles, texts);

    expect(controller.chapterChoices).toEqual([
      { number: 1, title: 'Introduction' },
      { number: 3, title: 'TEMPEST, SHIPWRECK, EARTHQUAKE' },
    ]);
    controller.destroy();
  });

  it('follows a typed number from the heading to its chapter', async () => {
    const { controller } = await nothingFound({}, titles, texts);

    await controller.askQuestion('try chapter 5');

    expect(controller.turns[1]).toMatchObject({
      kind: 'chapter-retry',
      chapter: { number: 3, title: 'TEMPEST, SHIPWRECK, EARTHQUAKE' },
    });
    controller.destroy();
  });
});
