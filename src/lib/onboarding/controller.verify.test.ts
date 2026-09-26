// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { epub, file, harness, READY } from './testing/harness';
import type { OllamaState } from '../ollama/testing/simulated-ollama';

beforeEach(() => setLanguage('en'));

/** A book with one plain-text chunk per passage given. */
async function bookWith(passages: string[]) {
  const result = await ingestEpub(
    epub('Candide', undefined, {
      documents: passages.map((text, i) => ({
        href: `${i}.xhtml`,
        body: `<p>${text}</p>`,
      })),
      toc: passages.map((_, i) => ({
        title: `Part ${i + 1}`,
        href: `${i}.xhtml`,
      })),
    }),
    { registry: new InMemoryRegistry() },
  );
  if (result.status !== 'new') throw new Error('expected a new book');
  return result.book;
}

/**
 * `random` drives both which passage is picked and whether the true or changed claim is
 * shown: below 0.5 shows the true claim, 0.5 and above the changed one.
 */
async function verifyReady(
  state: OllamaState = { ...READY },
  random = () => 0.9,
  passages = [
    'The old lighthouse keeper watched the storm from his window every single night.',
  ],
) {
  const book = await bookWith(passages);
  const context = await harness(state, {
    language: 'en',
    books: [book],
    indexed: true,
    random,
  });
  await context.controller.start();
  context.controller.setMode('verify');
  return { ...context, book, state };
}

describe('the mode', () => {
  it('starts in Ask mode and switches to Verify', async () => {
    const context = await harness({ ...READY }, { language: 'en' });
    await context.controller.start();
    expect(context.controller.mode).toBe('ask');

    context.controller.setMode('verify');

    expect(context.controller.mode).toBe('verify');
    context.controller.destroy();
  });
});

describe('requesting a claim', () => {
  it('generates nothing until asked', async () => {
    const { controller, state } = await verifyReady();

    expect(controller.verify).toEqual({ state: 'idle' });
    expect(state.chatCalls ?? 0).toBe(0);
    controller.destroy();
  });

  it('shows a changed claim with its real citation, and announces it', async () => {
    const { controller, book } = await verifyReady();

    await controller.requestClaim();

    expect(controller.verify.state).toBe('ready');
    expect(controller.verify.claim).toMatchObject({
      isTrue: false,
      changedAttribute: 'who',
      citation: {
        chunkId: book.chunks[0].id,
        locator: book.chunks[0].locator,
        text: book.chunks[0].text,
      },
    });
    expect(controller.verify.claim?.claim).toMatch(/^Changed:/);
    expect(controller.announcement).toEqual({
      key: 'announce.claimReady',
      params: undefined,
    });
    controller.destroy();
  });

  it('shows the true claim when that is the one chosen', async () => {
    const { controller } = await verifyReady({ ...READY }, () => 0.1);

    await controller.requestClaim();

    expect(controller.verify.claim).toMatchObject({ isTrue: true });
    expect(controller.verify.claim?.changedAttribute).toBeUndefined();
    controller.destroy();
  });

  it('generates only one claim at a time', async () => {
    const { controller, state } = await verifyReady({
      ...READY,
      chatStall: true,
    });

    const pending = controller.requestClaim();
    await vi.waitFor(() => expect(state.chatCalls).toBe(1));
    expect(controller.verifyBusy).toBe(true);

    await controller.requestClaim();

    expect(state.chatCalls).toBe(1);
    controller.stopClaim();
    await pending;
    controller.destroy();
  });
});

describe('stopping a claim', () => {
  it('shows nothing, counts nothing, and allows a new request at once', async () => {
    const { controller, state } = await verifyReady({
      ...READY,
      chatStall: true,
    });

    const pending = controller.requestClaim();
    await vi.waitFor(() => expect(state.chatCalls).toBe(1));
    controller.stopClaim();
    await pending;

    expect(controller.verify).toEqual({ state: 'idle' });
    expect(controller.verifyTally).toEqual({ judged: 0, correct: 0 });

    state.chatStall = false;
    await controller.requestClaim();
    expect(controller.verify.state).toBe('ready');
    controller.destroy();
  });
});

describe('judging a claim', () => {
  it('reveals a right judgment and counts it', async () => {
    const { controller } = await verifyReady();
    await controller.requestClaim();

    controller.judgeClaim(false);

    expect(controller.verify).toMatchObject({
      state: 'revealed',
      guess: false,
    });
    expect(controller.verifyTally).toEqual({ judged: 1, correct: 1 });
    expect(controller.announcement).toEqual({
      key: 'announce.judgedRight',
      params: undefined,
    });
    controller.destroy();
  });

  it('reveals a wrong judgment and counts it as judged only', async () => {
    const { controller } = await verifyReady({ ...READY }, () => 0.1);
    await controller.requestClaim();

    controller.judgeClaim(false);

    expect(controller.verifyTally).toEqual({ judged: 1, correct: 0 });
    expect(controller.announcement).toEqual({
      key: 'announce.judgedWrong',
      params: undefined,
    });
    controller.destroy();
  });

  it('judges a claim only once', async () => {
    const { controller } = await verifyReady();
    await controller.requestClaim();

    controller.judgeClaim(false);
    controller.judgeClaim(true);

    expect(controller.verify.guess).toBe(false);
    expect(controller.verifyTally).toEqual({ judged: 1, correct: 1 });
    controller.destroy();
  });

  it('does nothing when there is no claim to judge', async () => {
    const { controller } = await verifyReady();

    controller.judgeClaim(true);

    expect(controller.verify).toEqual({ state: 'idle' });
    expect(controller.verifyTally).toEqual({ judged: 0, correct: 0 });
    controller.destroy();
  });
});

describe('failures and retry', () => {
  it('reports unreachable, announces it, and leaves the tally alone', async () => {
    const { controller } = await verifyReady({ ...READY, chatDropAfter: 0 });

    await controller.requestClaim();

    expect(controller.verify).toMatchObject({
      state: 'failed',
      error: { code: 'unreachable' },
    });
    expect(controller.verifyTally).toEqual({ judged: 0, correct: 0 });
    expect(controller.announcement).toEqual({
      key: 'announce.claimFailed',
      params: undefined,
    });
    controller.destroy();
  });

  it('reports a claim whose change was never confirmed as false', async () => {
    const { controller } = await verifyReady({
      ...READY,
      claimVerdict: 'MATCHES',
    });

    await controller.requestClaim();

    expect(controller.verify).toMatchObject({
      state: 'failed',
      error: { code: 'unverified' },
    });
    controller.destroy();
  });

  it('retries with a new request once Ollama works again', async () => {
    const state: OllamaState = { ...READY, chatDropAfter: 0 };
    const { controller } = await verifyReady(state);
    await controller.requestClaim();
    expect(controller.verify.state).toBe('failed');

    state.chatDropAfter = undefined;
    await controller.retryClaim();

    expect(controller.verify.state).toBe('ready');
    controller.destroy();
  });
});

describe('passages already used', () => {
  it('are not used again until every passage has been', async () => {
    const { controller, book } = await verifyReady({ ...READY }, () => 0.1, [
      'The old lighthouse keeper watched the storm from his window.',
      'The baker left the village before the snow arrived that winter.',
    ]);
    expect(book.chunks).toHaveLength(2);

    const used: string[] = [];
    for (let i = 0; i < 3; i++) {
      await controller.requestClaim();
      expect(controller.verify.state).toBe('ready');
      used.push(controller.verify.claim!.citation.chunkId);
      controller.judgeClaim(true);
    }

    expect(new Set(used.slice(0, 2)).size).toBe(2);
    expect(book.chunks.map((chunk) => chunk.id)).toContain(used[2]);
    controller.destroy();
  });
});

describe('Verify mode resets with the active book', () => {
  it('clears the claim and tally when a newly imported book becomes active', async () => {
    const { controller } = await verifyReady();
    await controller.requestClaim();
    controller.judgeClaim(false);
    await controller.requestClaim();
    expect(controller.verifyTally.judged).toBe(1);

    await controller.importFiles([
      file(epub('A Different Book'), 'other.epub'),
    ]);

    expect(controller.verify).toEqual({ state: 'idle' });
    expect(controller.verifyTally).toEqual({ judged: 0, correct: 0 });
    controller.destroy();
  });

  it('abandons a claim being generated for the previous book', async () => {
    const { controller, state } = await verifyReady({
      ...READY,
      chatStall: true,
    });
    const pending = controller.requestClaim();
    await vi.waitFor(() => expect(state.chatCalls).toBe(1));

    await controller.importFiles([
      file(epub('A Different Book'), 'other.epub'),
    ]);
    await pending;

    expect(controller.verify).toEqual({ state: 'idle' });
    expect(controller.verifyBusy).toBe(false);
    controller.destroy();
  });
});
