// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  jsonResponse,
  neverAnswers,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import {
  classifyEmbedError,
  embedTexts,
  EMBED_BATCH_SIZE,
  EMBED_MIN_TIMEOUT_MS,
  EMBED_TIMEOUT_PER_TEXT_MS,
  embedTimeoutMs,
  validateEmbeddings,
} from './embed';

const clientFor = (routes: Record<string, FakeHandler>) => {
  const fake = createFakeFetch(routes);
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const embedRoute = (handler: FakeHandler): Record<string, FakeHandler> => ({
  'POST /api/embed': handler,
});

const ok = (embeddings: unknown) =>
  embedRoute(() => jsonResponse({ embeddings }));

describe('embedTexts', () => {
  it('asks Ollama to keep the model loaded for the client’s idle time', async () => {
    const fake = createFakeFetch(ok([[1, 2]]));
    const client = createOllamaClient({ fetch: fake.fetch, keepAlive: -1 });

    await embedTexts(client, 'bge-m3', ['Hello']);

    expect(JSON.parse(fake.requests[0].body!).keep_alive).toBe(-1);
  });

  it('sends no keep_alive when the client has none', async () => {
    const { fake, client } = clientFor(ok([[1, 2]]));

    await embedTexts(client, 'bge-m3', ['Hello']);

    expect(JSON.parse(fake.requests[0].body!)).not.toHaveProperty('keep_alive');
  });

  it('asks Ollama to embed the texts with the named model', async () => {
    const { fake, client } = clientFor(ok([[1, 2]]));

    await embedTexts(client, 'bge-m3', ['Hello']);

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/embed',
    });
    expect(JSON.parse(fake.requests[0].body!)).toEqual({
      model: 'bge-m3',
      input: ['Hello'],
    });
  });

  it('returns one vector per text, in order', async () => {
    const { client } = clientFor(
      ok([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    );

    const result = await embedTexts(client, 'bge-m3', ['a', 'b']);

    expect(result).toEqual({
      status: 'ok',
      vectors: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
  });

  it('sends nothing for no texts', async () => {
    const { fake, client } = clientFor(ok([]));

    expect(await embedTexts(client, 'bge-m3', [])).toEqual({
      status: 'ok',
      vectors: [],
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('sends the texts only to the configured address', async () => {
    const fake = createFakeFetch(ok([[1]]));
    const client = createOllamaClient({
      baseUrl: 'http://ollama.example:9999/',
      fetch: fake.fetch,
    });

    await embedTexts(client, 'bge-m3', ['secret passage']);

    expect(fake.requests.map((request) => request.url)).toEqual([
      'http://ollama.example:9999/api/embed',
    ]);
  });

  it('fails with a typed error when the number of vectors is wrong', async () => {
    const { client } = clientFor(ok([[1, 2]]));

    const result = await embedTexts(client, 'bge-m3', ['a', 'b']);

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'embed-failed' },
    });
  });

  it.each([
    ['an empty vector', [[1], []]],
    ['a value that is not a number', [[1], ['x']]],
    ['a value that is not finite', [[1], [null]]],
    ['vectors of different lengths', [[1, 2], [3]]],
  ])('fails when the answer has %s', async (_name, embeddings) => {
    const { client } = clientFor(ok(embeddings));

    const result = await embedTexts(client, 'bge-m3', ['a', 'b']);

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'embed-failed' },
    });
  });

  it('fails when the answer is not a list of vectors', async () => {
    const { client } = clientFor(embedRoute(() => jsonResponse({ nope: 1 })));

    expect(await embedTexts(client, 'bge-m3', ['a'])).toMatchObject({
      status: 'failed',
      error: { code: 'embed-failed' },
    });
  });

  it('fails when the answer is not JSON', async () => {
    const { client } = clientFor(
      embedRoute(() => new Response('<html>', { status: 200 })),
    );

    expect(await embedTexts(client, 'bge-m3', ['a'])).toMatchObject({
      status: 'failed',
      error: { code: 'embed-failed', detail: 'The answer is not valid JSON' },
    });
  });

  it('reports a model that is not installed as model-not-found', async () => {
    const { client } = clientFor(
      embedRoute(() =>
        jsonResponse(
          { error: 'model "nope" not found, try pulling it first' },
          404,
        ),
      ),
    );

    expect(await embedTexts(client, 'nope', ['a'])).toEqual({
      status: 'failed',
      error: {
        code: 'model-not-found',
        detail: 'model "nope" not found, try pulling it first',
      },
    });
  });

  it('keeps Ollama’s message for any other error', async () => {
    const { client } = clientFor(
      embedRoute(() => jsonResponse({ error: 'out of memory' }, 500)),
    );

    expect(await embedTexts(client, 'bge-m3', ['a'])).toEqual({
      status: 'failed',
      error: { code: 'embed-failed', detail: 'out of memory' },
    });
  });

  it('reports a refused connection as unreachable', async () => {
    const { client } = clientFor({});

    expect(await embedTexts(client, 'bge-m3', ['a'])).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it('reports an unanswered request as unreachable after the time limit', async () => {
    const { client } = clientFor(embedRoute(neverAnswers));

    const result = await embedTexts(client, 'bge-m3', ['a'], {
      timeoutMs: 20,
    });

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'unreachable', detail: 'Ollama did not answer in time' },
    });
  });

  it('gives aborted, not a failure, when the caller aborts', async () => {
    const { client } = clientFor(embedRoute(neverAnswers));
    const controller = new AbortController();

    const pending = embedTexts(client, 'bge-m3', ['a'], {
      signal: controller.signal,
    });
    controller.abort();

    expect(await pending).toEqual({ status: 'aborted' });
  });

  it('does not send a request when already aborted', async () => {
    const { fake, client } = clientFor(ok([[1]]));

    const result = await embedTexts(client, 'bge-m3', ['a'], {
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ status: 'aborted' });
    expect(fake.requests).toHaveLength(0);
  });

  it('sends one text per request, so progress moves with every finished chunk', () => {
    expect(EMBED_BATCH_SIZE).toBe(1);
  });

  it('allows more time for more texts, so a slow but working Ollama is not called stopped', () => {
    // A real laptop without a graphics card took about 21 s per chunk of 1,000 characters.
    const realSecondsPerChunk = 21;
    expect(embedTimeoutMs(1)).toBe(EMBED_MIN_TIMEOUT_MS);
    expect(embedTimeoutMs(EMBED_BATCH_SIZE)).toBeGreaterThan(
      EMBED_BATCH_SIZE * realSecondsPerChunk * 1000,
    );
    expect(embedTimeoutMs(100)).toBe(100 * EMBED_TIMEOUT_PER_TEXT_MS);
  });
});

describe('validateEmbeddings', () => {
  it('accepts matching vectors', () => {
    expect(validateEmbeddings({ embeddings: [[0.5, -1]] }, 1)).toEqual({
      ok: true,
      vectors: [[0.5, -1]],
    });
  });

  it.each([undefined, null, 'x', 3, []])(
    'rejects a body that is %s',
    (body) => {
      expect(validateEmbeddings(body, 1).ok).toBe(false);
    },
  );
});

describe('classifyEmbedError', () => {
  it('tells a missing model from a missing endpoint', () => {
    expect(classifyEmbedError('model "x" not found', 404).code).toBe(
      'model-not-found',
    );
    expect(classifyEmbedError('404 page not found', 404).code).toBe(
      'embed-failed',
    );
  });
});
