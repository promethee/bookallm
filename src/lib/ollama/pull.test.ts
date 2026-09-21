// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from './client';
import { classifyPullError, pullModel } from './pull';
import {
  createFakeFetch,
  jsonResponse,
  ndjson,
  streamResponse,
  type FakeHandler,
} from './testing/fake-fetch';
import { sendChunks, startTestServer } from './testing/test-server';
import type { PullProgress } from './types';

const clientFor = (routes: Record<string, FakeHandler>) => {
  const fake = createFakeFetch(routes);
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const pullRoute = (...lines: unknown[]): Record<string, FakeHandler> => ({
  'POST /api/pull': () => streamResponse([ndjson(...lines)]),
});

const SUCCESS_LINES = [
  { status: 'pulling manifest' },
  { status: 'pulling aaa', digest: 'aaa', total: 100, completed: 40 },
  { status: 'pulling aaa', digest: 'aaa', total: 100, completed: 100 },
  { status: 'verifying sha256 digest' },
  { status: 'writing manifest' },
  { status: 'success' },
];

describe('pullModel success and progress', () => {
  it('asks Ollama to stream a pull of the named model', async () => {
    const { fake, client } = clientFor(pullRoute(...SUCCESS_LINES));

    await pullModel(client, 'llama3.1:8b');

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/pull',
    });
    expect(JSON.parse(fake.requests[0].body!)).toEqual({
      model: 'llama3.1:8b',
      stream: true,
    });
  });

  it('succeeds on Ollama’s success line and reports progress repeatedly, ending in done', async () => {
    const { client } = clientFor(pullRoute(...SUCCESS_LINES));
    const updates: PullProgress[] = [];

    const result = await pullModel(client, 'x', {
      onProgress: (p) => updates.push(p),
    });

    expect(result).toEqual({ status: 'success' });
    expect(updates.map((u) => u.phase)).toEqual([
      'preparing',
      'downloading',
      'downloading',
      'verifying',
      'finishing',
      'done',
    ]);
    expect(updates[1]).toMatchObject({
      completedBytes: 40,
      totalBytes: 100,
      fraction: 0.4,
    });
    expect(updates.at(-1)?.phase).toBe('done');
  });

  it('is not disturbed by a progress listener that throws', async () => {
    const { client } = clientFor(pullRoute(...SUCCESS_LINES));

    const result = await pullModel(client, 'x', {
      onProgress: () => {
        throw new Error('listener bug');
      },
    });

    expect(result).toEqual({ status: 'success' });
  });

  it('works through a real HTTP server that splits lines across chunks', async () => {
    const text = ndjson(...SUCCESS_LINES);
    const server = await startTestServer((_request, response) =>
      sendChunks(response, [
        text.slice(0, 37),
        text.slice(37, 130),
        text.slice(130),
      ]),
    );
    try {
      const client = createOllamaClient({ baseUrl: server.url });
      const updates: PullProgress[] = [];

      const result = await pullModel(client, 'x', {
        onProgress: (p) => updates.push(p),
      });

      expect(result).toEqual({ status: 'success' });
      expect(updates.at(-1)?.phase).toBe('done');
    } finally {
      await server.close();
    }
  });
});

describe('pullModel cancellation and resume', () => {
  it('is cancelled, not failed, when the signal aborts mid-download', async () => {
    const { client } = clientFor({
      'POST /api/pull': (_request, signal) =>
        streamResponse(
          [
            ndjson(
              { status: 'pulling manifest' },
              { digest: 'a', total: 100, completed: 10 },
            ),
          ],
          { stall: true, signal },
        ),
    });
    const controller = new AbortController();
    const updates: PullProgress[] = [];

    const result = await pullModel(client, 'x', {
      signal: controller.signal,
      onProgress: (progress) => {
        updates.push(progress);
        if (progress.phase === 'downloading') controller.abort();
      },
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(updates.at(-1)?.phase).toBe('downloading');
  });

  it('stops at once when cancelled, even if more lines were already buffered from the same chunk', async () => {
    // All the lines arrive in one chunk, so they are all buffered when the first is handled.
    const { client } = clientFor(pullRoute(...SUCCESS_LINES));
    const controller = new AbortController();
    const updates: PullProgress[] = [];

    const result = await pullModel(client, 'x', {
      signal: controller.signal,
      onProgress: (progress) => {
        updates.push(progress);
        controller.abort();
      },
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(updates).toHaveLength(1);
  });

  it('is cancelled without any request when the signal is already aborted', async () => {
    const { fake, client } = clientFor(pullRoute(...SUCCESS_LINES));

    const result = await pullModel(client, 'x', {
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(fake.requests).toEqual([]);
  });

  it('really ends the connection to the server when cancelled', async () => {
    let serverSawClose = false;
    const server = await startTestServer(async (request, response) => {
      request.on('close', () => {
        serverSawClose = true;
      });
      await sendChunks(
        response,
        [ndjson({ digest: 'a', total: 100, completed: 10 })],
        {
          end: false,
        },
      );
    });
    try {
      const client = createOllamaClient({ baseUrl: server.url });
      const controller = new AbortController();

      const result = await pullModel(client, 'x', {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      });

      expect(result).toEqual({ status: 'cancelled' });
      for (let i = 0; i < 50 && !serverSawClose; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(serverSawClose).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('continues by pulling the same model again, without deleting anything', async () => {
    let calls = 0;
    const { fake, client } = clientFor({
      'POST /api/pull': (_request, signal) => {
        calls += 1;
        return calls === 1
          ? streamResponse(
              [ndjson({ digest: 'a', total: 100, completed: 30 })],
              {
                stall: true,
                signal,
              },
            )
          : streamResponse([
              ndjson(
                { digest: 'a', total: 100, completed: 100 },
                { status: 'success' },
              ),
            ]);
      },
    });
    const controller = new AbortController();

    const first = await pullModel(client, 'llama3.1:8b', {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    const second = await pullModel(client, 'llama3.1:8b');

    expect(first.status).toBe('cancelled');
    expect(second).toEqual({ status: 'success' });
    // Both were plain pulls of the same model; nothing else (such as a delete) was sent.
    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/pull',
      'POST /api/pull',
    ]);
    expect(fake.requests.map((r) => JSON.parse(r.body!).model)).toEqual([
      'llama3.1:8b',
      'llama3.1:8b',
    ]);
  });
});

describe('pullModel failures', () => {
  it('fails with model-not-found for an error line inside a normal response', async () => {
    const { client } = clientFor(
      pullRoute(
        { status: 'pulling manifest' },
        { error: 'pull model manifest: file does not exist' },
      ),
    );

    expect(await pullModel(client, 'nope:1b')).toEqual({
      status: 'failed',
      error: {
        code: 'model-not-found',
        detail: 'pull model manifest: file does not exist',
      },
    });
  });

  it('treats an error line part-way through a download as a failure, not success', async () => {
    const { client } = clientFor(
      pullRoute(
        { status: 'pulling manifest' },
        { digest: 'a', total: 100, completed: 50 },
        { error: 'something went wrong' },
      ),
    );

    const result = await pullModel(client, 'x');

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'pull-failed', detail: 'something went wrong' },
    });
  });

  it('fails with insufficient-disk-space when Ollama says there is no space left', async () => {
    const { client } = clientFor(
      pullRoute({
        error:
          'write /home/u/.ollama/models/blobs/sha256-1: no space left on device',
      }),
    );

    const result = await pullModel(client, 'x');

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'insufficient-disk-space' },
    });
  });

  it('fails with pull-failed and keeps the message for anything else', async () => {
    const { client } = clientFor(pullRoute({ error: 'unexpected EOF' }));

    expect(await pullModel(client, 'x')).toEqual({
      status: 'failed',
      error: { code: 'pull-failed', detail: 'unexpected EOF' },
    });
  });

  it('reports a registry that cannot be reached (offline) as pull-failed with its message', async () => {
    const message =
      'pull model manifest: Get "https://registry.ollama.ai/v2/library/llama3.1/manifests/8b": ' +
      'dial tcp: lookup registry.ollama.ai: no such host';
    const { client } = clientFor(pullRoute({ error: message }));

    expect(await pullModel(client, 'x')).toEqual({
      status: 'failed',
      error: { code: 'pull-failed', detail: message },
    });
  });

  it('fails with unreachable when the connection drops mid-download', async () => {
    const { client } = clientFor({
      'POST /api/pull': () =>
        streamResponse([ndjson({ digest: 'a', total: 100, completed: 10 })], {
          failWith: new TypeError('terminated'),
        }),
    });

    expect(await pullModel(client, 'x')).toEqual({
      status: 'failed',
      error: { code: 'unreachable', detail: 'terminated' },
    });
  });

  it('fails with unreachable when the connection is refused', async () => {
    const client = createOllamaClient({ fetch: createFakeFetch({}).fetch });

    expect(await pullModel(client, 'x')).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it('fails with unreachable when the stream ends before success', async () => {
    const { client } = clientFor(
      pullRoute(
        { status: 'pulling manifest' },
        { digest: 'a', total: 100, completed: 10 },
      ),
    );

    expect(await pullModel(client, 'x')).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it.each([
    [
      'a JSON error with a not-found message',
      jsonResponse({ error: 'model "x" not found' }, 404),
      'model-not-found',
    ],
    ['a JSON error body', jsonResponse({ error: 'boom' }, 500), 'pull-failed'],
    [
      'a plain-text error body',
      new Response('bad gateway', { status: 502 }),
      'pull-failed',
    ],
  ])('maps an HTTP error status with %s', async (_name, response, code) => {
    const { client } = clientFor({ 'POST /api/pull': () => response });

    const result = await pullModel(client, 'x');

    expect(result).toMatchObject({ status: 'failed', error: { code } });
  });
});

describe('classifyPullError', () => {
  it('checks for disk space before other wording', () => {
    expect(
      classifyPullError('model not found: no space left on device').code,
    ).toBe('insufficient-disk-space');
  });

  it.each([
    'no space left on device',
    'Not enough disk space',
    'insufficient space',
    'disk full',
  ])('recognises the disk-space wording %j', (message) => {
    expect(classifyPullError(message).code).toBe('insufficient-disk-space');
  });

  it.each([
    'file does not exist',
    'model "x" not found',
    'unknown model x',
    'manifest unknown',
  ])('recognises the not-found wording %j', (message) => {
    expect(classifyPullError(message).code).toBe('model-not-found');
  });
});
