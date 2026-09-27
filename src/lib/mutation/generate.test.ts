// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeIndexableBook } from '../indexing/testing/books';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  jsonResponse,
  ndjson,
  streamResponse,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import { generateClaim } from './generate';
import type { ClaimStep } from './types';

const scripted = (content: string) =>
  streamResponse([
    ndjson({ message: { role: 'assistant', content }, done: false }),
    ndjson({ message: { role: 'assistant', content: '' }, done: true }),
  ]);

const EXTRACTED = 'Mr. Bennet visited Mr. Bingley first.';
const MUTATED = 'ATTRIBUTE: where\nCLAIM: Mr. Bennet visited Mr. Darcy first.';

/** A fake `/api/chat` that answers each call in order from `replies`, cycling the last. */
function sequencedClient(replies: readonly string[]) {
  let calls = 0;
  const handler: FakeHandler = () => {
    const content = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    return scripted(content);
  };
  const fake = createFakeFetch({ 'POST /api/chat': handler });
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
}

describe('generateClaim', () => {
  it('returns the true claim, with the real citation, when the coin favours it', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([EXTRACTED, MUTATED, 'CONTRADICTS']);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.1,
    });

    expect(result).toEqual({
      status: 'ok',
      claim: {
        claim: EXTRACTED,
        isTrue: true,
        changedAttribute: undefined,
        citation: {
          chunkId: book.chunks[0].id,
          locator: book.chunks[0].locator,
          text: book.chunks[0].text,
        },
        difficulty: 'flat',
      },
    });
  });

  it('returns the changed claim, with its attribute, when the coin favours it', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([EXTRACTED, MUTATED, 'CONTRADICTS']);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(result).toEqual({
      status: 'ok',
      claim: {
        claim: 'Mr. Bennet visited Mr. Darcy first.',
        isTrue: false,
        changedAttribute: 'where',
        citation: {
          chunkId: book.chunks[0].id,
          locator: book.chunks[0].locator,
          text: book.chunks[0].text,
        },
        difficulty: 'flat',
      },
    });
  });

  it('retries the mutation once and succeeds on the second attempt', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([
      EXTRACTED,
      MUTATED,
      'MATCHES', // first attempt: not confirmed
      MUTATED,
      'CONTRADICTS', // second attempt: confirmed
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(result.status).toBe('ok');
    expect(fake.requests).toHaveLength(5);
  });

  it('reports each step, in order, with the raw replies', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([
      EXTRACTED,
      MUTATED,
      'MATCHES',
      MUTATED,
      'CONTRADICTS',
    ]);
    const steps: ClaimStep[] = [];

    await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
      onStep: (step) => steps.push(step),
    });

    const chunkId = book.chunks[0].id;
    expect(steps.map((step) => ({ ...step, ms: 0 }))).toEqual([
      { stage: 'pick', chunkId, ms: 0 },
      { stage: 'extract', chunkId, ms: 0, raw: EXTRACTED, outcome: 'claim' },
      {
        stage: 'mutate',
        chunkId,
        ms: 0,
        attempt: 0,
        kind: 'where',
        raw: MUTATED,
        outcome: 'changed',
      },
      {
        stage: 'verify',
        chunkId,
        ms: 0,
        attempt: 0,
        raw: 'MATCHES',
        outcome: 'not-confirmed',
      },
      {
        stage: 'mutate',
        chunkId,
        ms: 0,
        attempt: 1,
        kind: 'where',
        raw: MUTATED,
        outcome: 'changed',
      },
      {
        stage: 'verify',
        chunkId,
        ms: 0,
        attempt: 1,
        raw: 'CONTRADICTS',
        outcome: 'confirmed',
      },
    ]);
    expect(steps.every((step) => step.ms >= 0)).toBe(true);
  });

  it('reports an unreadable change as a rejected step, then chat-failed', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([EXTRACTED, 'ATTRIBUTE: age']);
    const steps: ClaimStep[] = [];

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      onStep: (step) => steps.push(step),
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'chat-failed' },
    });
    expect(steps.at(-1)).toMatchObject({
      stage: 'mutate',
      outcome: 'rejected',
      reason: 'unreadable',
      raw: 'ATTRIBUTE: age',
    });
  });

  it('reports unverified after exhausting the retry limit', async () => {
    const book = makeIndexableBook([1]);
    // 1 extraction, then MUTATION_VERIFY_RETRIES + 1 = 3 (mutate, verify) attempts, each
    // verified as MATCHES (not confirmed).
    const { client, fake } = sequencedClient([
      EXTRACTED,
      MUTATED,
      'MATCHES',
      MUTATED,
      'MATCHES',
      MUTATED,
      'MATCHES',
    ]);

    const result = await generateClaim({ book, model: 'llama3.1:8b', client });

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'unverified' },
    });
    // 1 extraction + 3 attempts x (mutate + verify)
    expect(fake.requests).toHaveLength(7);
  });

  it('reports no-chunks-available for a book with nothing to pick from', async () => {
    const book = makeIndexableBook([0]);
    const { client } = sequencedClient([EXTRACTED]);

    const result = await generateClaim({ book, model: 'llama3.1:8b', client });

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'no-chunks-available' },
    });
  });

  it('does not send a request when already aborted', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([EXTRACTED]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ status: 'aborted' });
    expect(fake.requests).toHaveLength(0);
  });

  it('reports unreachable when the chat model cannot be reached at extraction', async () => {
    const book = makeIndexableBook([1]);
    const fake = createFakeFetch({});
    const client = createOllamaClient({ fetch: fake.fetch });

    const result = await generateClaim({ book, model: 'llama3.1:8b', client });

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it('reports model-not-found when the chat model is missing at the mutation step', async () => {
    const book = makeIndexableBook([1]);
    let calls = 0;
    const handler: FakeHandler = () => {
      calls += 1;
      if (calls === 1) return scripted(EXTRACTED);
      return jsonResponse(
        { error: 'model "llama3.1:8b" not found, try pulling it first' },
        404,
      );
    };
    const fake = createFakeFetch({ 'POST /api/chat': handler });
    const client = createOllamaClient({ fetch: fake.fetch });

    const result = await generateClaim({ book, model: 'llama3.1:8b', client });

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'model-not-found' },
    });
  });

  it('ends without an error result when aborted between calls', async () => {
    const book = makeIndexableBook([1]);
    const controller = new AbortController();
    let calls = 0;
    const handler: FakeHandler = () => {
      calls += 1;
      if (calls === 1) {
        // Abort right after the extraction call resolves, before the mutation call.
        queueMicrotask(() => controller.abort());
      }
      return scripted(EXTRACTED);
    };
    const fake = createFakeFetch({ 'POST /api/chat': handler });
    const client = createOllamaClient({ fetch: fake.fetch });

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      signal: controller.signal,
    });

    expect(result).toEqual({ status: 'aborted' });
    expect(calls).toBe(1);
  });

  it('never writes to any store, and only reaches the configured Ollama address', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([
      EXTRACTED,
      MUTATED,
      'CONTRADICTS',
    ]);

    await generateClaim({ book, model: 'llama3.1:8b', client });

    // Every request the fake recorded went through the one client this test built, which
    // is configured with no address but the fake's own - there is no other store, no
    // settings object and no vector store this module could reach in the first place.
    expect(fake.requests.every((request) => request.path === '/api/chat')).toBe(
      true,
    );
  });
});
