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
import { MUTATION_VERIFY_RETRIES } from './defaults';
import { generateClaim } from './generate';
import type { ClaimStep } from './types';

const scripted = (content: string) =>
  streamResponse([
    ndjson({ message: { role: 'assistant', content }, done: false }),
    ndjson({ message: { role: 'assistant', content: '' }, done: true }),
  ]);

const EXTRACTED = 'Mr. Bennet visited Mr. Bingley first.';
const MUTATED = 'Mr. Bennet visited Mr. Darcy first.';
const MUTATED_AGAIN = 'Mr. Bennet visited Mr. Collins first.';

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

/** A change the check never confirms, for every round a passage gets. */
const rejectedRounds = Array.from(
  { length: MUTATION_VERIFY_RETRIES + 1 },
  () => [MUTATED, 'TRUE'],
).flat();
/** 1 extraction + (MUTATION_VERIFY_RETRIES + 1) x (mutate + verify). */
const CALLS_PER_FAILED_PASSAGE = 1 + rejectedRounds.length;

/** The system prompt of the `index`-th chat request the fake received. */
const promptOf = (
  fake: ReturnType<typeof sequencedClient>['fake'],
  index: number,
) =>
  (
    JSON.parse(fake.requests[index].body!) as {
      messages: { role: string; content: string }[];
    }
  ).messages[0].content;

/*
 * How `random` drives a call: one value to pick the chunk, one to shuffle the two kinds
 * (again for a fresh passage), then one for the true/changed coin. A constant 0.9 keeps
 * the kinds in their listed order (who, where) and offers the changed claim; a constant
 * 0.1 starts with `where` and offers the true claim.
 */
describe('generateClaim', () => {
  it('returns the true claim, with the real citation, when the coin favours it', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([EXTRACTED, MUTATED, 'FALSE']);

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
        trueClaim: EXTRACTED,
        changedAttribute: undefined,
        changes: undefined,
        citation: {
          chunkId: book.chunks[0].id,
          locator: book.chunks[0].locator,
          text: book.chunks[0].text,
        },
        difficulty: 'flat',
      },
    });
  });

  it('returns the changed claim with the chosen kind and the changed words', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([EXTRACTED, MUTATED, 'FALSE']);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(result).toEqual({
      status: 'ok',
      claim: {
        claim: MUTATED,
        isTrue: false,
        trueClaim: EXTRACTED,
        changedAttribute: 'who',
        changes: [{ before: 'Bingley', after: 'Darcy' }],
        citation: {
          chunkId: book.chunks[0].id,
          locator: book.chunks[0].locator,
          text: book.chunks[0].text,
        },
        difficulty: 'flat',
      },
    });
  });

  it('asks for the kinds in the order random gives', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([EXTRACTED, MUTATED, 'FALSE']);

    await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.1,
    });

    expect(promptOf(fake, 0)).toContain('where something happened');
    expect(promptOf(fake, 1)).toContain('replace that place');
  });

  it('moves to the next kind when the passage has none of the first', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([
      'NONE',
      EXTRACTED,
      MUTATED,
      'FALSE',
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(promptOf(fake, 0)).toContain('who did or said something');
    expect(promptOf(fake, 1)).toContain('where something happened');
    expect(result).toMatchObject({
      status: 'ok',
      claim: { changedAttribute: 'where' },
    });
  });

  it('tries a fresh passage when the first has no claim of any kind', async () => {
    const book = makeIndexableBook([2]);
    const { client, fake } = sequencedClient([
      'NONE',
      'NONE',
      EXTRACTED,
      MUTATED,
      'FALSE',
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    // 0.9 picks the second of two chunks first, then the only one left.
    expect(result).toMatchObject({
      status: 'ok',
      claim: { citation: { chunkId: book.chunks[0].id } },
    });
    expect(fake.requests).toHaveLength(5);
  });

  it('treats a claim too short to judge like no claim of that kind', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([
      'He said.',
      EXTRACTED,
      MUTATED,
      'FALSE',
    ]);
    const steps: ClaimStep[] = [];

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
      onStep: (step) => steps.push(step),
    });

    expect(steps[1]).toMatchObject({
      stage: 'extract',
      kind: 'who',
      outcome: 'too-short',
    });
    expect(result).toMatchObject({
      status: 'ok',
      claim: { trueClaim: EXTRACTED, changedAttribute: 'where' },
    });
  });

  it('retries a change that alters nothing, saying why', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([
      EXTRACTED,
      EXTRACTED,
      MUTATED,
      'FALSE',
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(result.status).toBe('ok');
    expect(promptOf(fake, 2)).toContain(
      `- "${EXTRACTED}" (it says the same as the true claim)`,
    );
  });

  it('retries a change that rewrites too much', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([
      EXTRACTED,
      'Elizabeth refused Mr. Collins in the garden at Longbourn.',
      MUTATED,
      'FALSE',
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(result.status).toBe('ok');
    expect(promptOf(fake, 2)).toContain(
      '(it changes more than that one detail)',
    );
  });

  it('retries an unreadable reply instead of failing', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([
      EXTRACTED,
      'ATTRIBUTE: age',
      MUTATED,
      'FALSE',
    ]);
    const steps: ClaimStep[] = [];

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
      onStep: (step) => steps.push(step),
    });

    expect(result.status).toBe('ok');
    expect(steps).toContainEqual(
      expect.objectContaining({
        stage: 'mutate',
        outcome: 'rejected',
        reason: 'unreadable',
        raw: 'ATTRIBUTE: age',
      }),
    );
  });

  it('retries a change the check does not confirm, saying why', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([
      EXTRACTED,
      MUTATED,
      'TRUE',
      MUTATED_AGAIN,
      'FALSE',
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.9,
    });

    expect(result).toMatchObject({
      status: 'ok',
      claim: { claim: MUTATED_AGAIN },
    });
    expect(promptOf(fake, 3)).toContain(
      `- "${MUTATED}" (it is still true according to the passage)`,
    );
  });

  it('reports each step, in order, with the raw replies', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient([
      'NONE',
      EXTRACTED,
      MUTATED,
      'TRUE',
      MUTATED,
      'FALSE',
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
      {
        stage: 'extract',
        chunkId,
        ms: 0,
        kind: 'who',
        raw: 'NONE',
        outcome: 'none',
      },
      {
        stage: 'extract',
        chunkId,
        ms: 0,
        kind: 'where',
        raw: EXTRACTED,
        outcome: 'claim',
      },
      {
        stage: 'mutate',
        chunkId,
        ms: 0,
        kind: 'where',
        attempt: 0,
        raw: MUTATED,
        outcome: 'changed',
      },
      {
        stage: 'verify',
        chunkId,
        ms: 0,
        attempt: 0,
        raw: 'TRUE',
        outcome: 'not-confirmed',
      },
      {
        stage: 'mutate',
        chunkId,
        ms: 0,
        kind: 'where',
        attempt: 1,
        raw: MUTATED,
        outcome: 'changed',
      },
      {
        stage: 'verify',
        chunkId,
        ms: 0,
        attempt: 1,
        raw: 'FALSE',
        outcome: 'confirmed',
      },
    ]);
    expect(steps.every((step) => step.ms >= 0)).toBe(true);
  });

  it('reports unverified, not the true claim, after both passages fail', async () => {
    const book = makeIndexableBook([2]);
    const onePassage = [EXTRACTED, ...rejectedRounds];
    const { client, fake } = sequencedClient([...onePassage, ...onePassage]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      random: () => 0.1,
    });

    expect(result).toEqual({
      status: 'failed',
      error: {
        code: 'unverified',
        detail: 'No changed claim was confirmed to contradict its passage.',
      },
    });
    expect(fake.requests).toHaveLength(2 * CALLS_PER_FAILED_PASSAGE);
  });

  it('reports unverified after one passage when no other is left', async () => {
    const book = makeIndexableBook([1]);
    const { client, fake } = sequencedClient([EXTRACTED, ...rejectedRounds]);

    const result = await generateClaim({ book, model: 'llama3.1:8b', client });

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'unverified' },
    });
    expect(fake.requests).toHaveLength(CALLS_PER_FAILED_PASSAGE);
  });

  it('says so when no passage yielded a claim', async () => {
    const book = makeIndexableBook([1]);
    const { client } = sequencedClient(['NONE']);

    const result = await generateClaim({ book, model: 'llama3.1:8b', client });

    expect(result).toEqual({
      status: 'failed',
      error: {
        code: 'unverified',
        detail: 'No passage yielded a claim of any kind.',
      },
    });
  });

  it('keeps the fresh passage out of the caller’s excluded chunks', async () => {
    const book = makeIndexableBook([3]);
    const { client } = sequencedClient([
      'NONE',
      'NONE',
      EXTRACTED,
      MUTATED,
      'FALSE',
    ]);

    const result = await generateClaim({
      book,
      model: 'llama3.1:8b',
      client,
      excludeChunkIds: [book.chunks[0].id],
      random: () => 0,
    });

    // 0 picks the first available chunk: chunk 1, then (chunk 1 tried) chunk 2.
    expect(result).toMatchObject({
      status: 'ok',
      claim: { citation: { chunkId: book.chunks[2].id } },
    });
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
    const { client, fake } = sequencedClient([EXTRACTED, MUTATED, 'FALSE']);

    await generateClaim({ book, model: 'llama3.1:8b', client });

    // Every request the fake recorded went through the one client this test built, which
    // is configured with no address but the fake's own - there is no other store, no
    // settings object and no vector store this module could reach in the first place.
    expect(fake.requests.every((request) => request.path === '/api/chat')).toBe(
      true,
    );
  });
});
