// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from './client';
import { DEFAULT_BASE_URL, MINIMUM_OLLAMA_VERSION } from './defaults';
import { detectOllama } from './detect';
import {
  createFakeFetch,
  jsonResponse,
  neverAnswers,
  type FakeHandler,
} from './testing/fake-fetch';
import { startTestServer } from './testing/test-server';

function detectWith(handler: FakeHandler, timeoutMs?: number) {
  const fake = createFakeFetch({ 'GET /api/version': handler });
  const client = createOllamaClient({ fetch: fake.fetch, timeoutMs });
  return { fake, result: detectOllama(client) };
}

describe('detectOllama statuses', () => {
  it('is ready with the version when Ollama is recent', async () => {
    const { result } = detectWith(() => jsonResponse({ version: '0.34.0' }));

    expect(await result).toEqual({ status: 'ready', version: '0.34.0' });
  });

  it('is ready at exactly the minimum version', async () => {
    const { result } = detectWith(() =>
      jsonResponse({ version: MINIMUM_OLLAMA_VERSION }),
    );

    expect(await result).toEqual({
      status: 'ready',
      version: MINIMUM_OLLAMA_VERSION,
    });
  });

  it('is outdated with the version found and the minimum when Ollama is old', async () => {
    const { result } = detectWith(() => jsonResponse({ version: '0.3.3' }));

    expect(await result).toEqual({
      status: 'outdated',
      version: '0.3.3',
      minimumVersion: MINIMUM_OLLAMA_VERSION,
    });
  });

  it('is unreachable when the connection is refused, which is also what a stopped install looks like', async () => {
    // No route at all: the fake fails like a refused connection.
    const client = createOllamaClient({ fetch: createFakeFetch({}).fetch });

    expect(await detectOllama(client)).toEqual({ status: 'unreachable' });
  });
});

describe('detectOllama when the answer is not Ollama', () => {
  it.each([
    ['an error status', () => jsonResponse({ version: '0.34.0' }, 500)],
    ['a body that is not JSON', () => new Response('<html>hello</html>')],
    ['a body without a version', () => jsonResponse({ hello: 'world' })],
    ['a version that is not text', () => jsonResponse({ version: 34 })],
    [
      'a version that is not a version',
      () => jsonResponse({ version: 'unknown' }),
    ],
    ['a JSON body that is not an object', () => jsonResponse(null)],
  ])('is unreachable for %s', async (_name, handler) => {
    const { result } = detectWith(handler);

    expect(await result).toEqual({ status: 'unreachable' });
  });
});

describe('detectOllama time limit', () => {
  it('gives up on a connection that never answers', async () => {
    const started = Date.now();
    const { result } = detectWith(neverAnswers, 50);

    expect(await result).toEqual({ status: 'unreachable' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('gives up on a server that sends headers and then stalls mid-body', async () => {
    const server = await startTestServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"vers'); // never finishes
    });
    try {
      const client = createOllamaClient({
        baseUrl: server.url,
        timeoutMs: 100,
      });

      expect(await detectOllama(client)).toEqual({ status: 'unreachable' });
    } finally {
      await server.close();
    }
  });
});

describe('detectOllama against a real HTTP server', () => {
  it('reads a real answer', async () => {
    const server = await startTestServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"version":"0.34.0"}');
    });
    try {
      const client = createOllamaClient({ baseUrl: server.url });

      expect(await detectOllama(client)).toEqual({
        status: 'ready',
        version: '0.34.0',
      });
    } finally {
      await server.close();
    }
  });
});

describe('detectOllama address and side effects', () => {
  it('uses the standard local address by default', async () => {
    const { fake, result } = detectWith(() =>
      jsonResponse({ version: '0.34.0' }),
    );
    await result;

    expect(fake.requests.map((r) => r.url)).toEqual([
      `${DEFAULT_BASE_URL}/api/version`,
    ]);
  });

  it('uses a custom address, ignoring a trailing slash', async () => {
    const fake = createFakeFetch({
      'GET /api/version': () => jsonResponse({ version: '0.34.0' }),
    });
    const client = createOllamaClient({
      baseUrl: 'http://ollama.lan:9999/',
      fetch: fake.fetch,
    });

    await detectOllama(client);

    expect(fake.requests.map((r) => r.url)).toEqual([
      'http://ollama.lan:9999/api/version',
    ]);
  });

  it('sends later requests through the same client to the same custom address', async () => {
    const fake = createFakeFetch({
      'GET /api/version': () => jsonResponse({ version: '0.34.0' }),
      'GET /api/tags': () => jsonResponse({ models: [] }),
    });
    const client = createOllamaClient({
      baseUrl: 'http://ollama.lan:9999',
      fetch: fake.fetch,
    });

    await detectOllama(client);
    await client.request('/api/tags');

    expect(fake.requests.map((r) => r.url)).toEqual([
      'http://ollama.lan:9999/api/version',
      'http://ollama.lan:9999/api/tags',
    ]);
  });

  it('only makes read requests', async () => {
    const { fake, result } = detectWith(() =>
      jsonResponse({ version: '0.34.0' }),
    );
    await result;

    expect(fake.requests.length).toBeGreaterThan(0);
    expect(fake.requests.every((request) => request.method === 'GET')).toBe(
      true,
    );
  });
});
