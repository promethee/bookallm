// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createFakeFetch,
  jsonResponse,
  ndjson,
  neverAnswers,
  readChunks,
  streamResponse,
} from './fake-fetch';
import { sendChunks, startTestServer } from './test-server';

describe('createFakeFetch', () => {
  it('routes by method and path and records requests', async () => {
    const fake = createFakeFetch({
      'GET /api/version': () => jsonResponse({ version: '0.34.0' }),
      'POST /api/pull': () => jsonResponse({}),
    });

    const response = await fake.fetch('http://localhost:11434/api/version');
    await fake.fetch('http://localhost:11434/api/pull', {
      method: 'POST',
      body: '{"model":"x"}',
    });

    expect(await response.json()).toEqual({ version: '0.34.0' });
    expect(fake.requests).toEqual([
      { method: 'GET', path: '/api/version', body: undefined },
      { method: 'POST', path: '/api/pull', body: '{"model":"x"}' },
    ]);
  });

  it('fails like a refused connection when no route matches', async () => {
    const fake = createFakeFetch({});

    await expect(
      fake.fetch('http://localhost:11434/api/version'),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('fails like an abort when the signal is already aborted', async () => {
    const fake = createFakeFetch({
      'GET /api/version': () => jsonResponse({}),
    });

    await expect(
      fake.fetch('http://localhost:11434/api/version', {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('lets a handler that never answers be timed out', async () => {
    const fake = createFakeFetch({ 'GET /api/version': neverAnswers });

    await expect(
      fake.fetch('http://localhost:11434/api/version', {
        signal: AbortSignal.timeout(30),
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});

describe('streamResponse', () => {
  it('delivers the chunks exactly as split, even in the middle of a line', async () => {
    const chunks = [
      '{"status":"pulling',
      ' manifest"}\n{"stat',
      'us":"success"}\n',
    ];

    expect(await readChunks(streamResponse(chunks))).toEqual(chunks);
  });

  it('errors the stream after the chunks to simulate a dropped connection', async () => {
    const response = streamResponse(['{"a":1}\n'], {
      failWith: new TypeError('terminated'),
    });

    await expect(readChunks(response)).rejects.toThrow('terminated');
  });

  it('errors a stalled stream when its signal aborts', async () => {
    const controller = new AbortController();
    const response = streamResponse(['{"a":1}\n'], {
      stall: true,
      signal: controller.signal,
    });
    const reading = readChunks(response);

    setTimeout(() => controller.abort(), 20);

    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('ndjson', () => {
  it('writes one JSON object per line', () => {
    expect(ndjson({ a: 1 }, { b: 2 })).toBe('{"a":1}\n{"b":2}\n');
  });
});

describe('startTestServer', () => {
  it('serves a real chunked body whose lines are split across chunks', async () => {
    const chunks = [
      '{"status":"pulling',
      ' manifest"}\n{"sta',
      'tus":"success"}\n',
    ];
    const server = await startTestServer((_request, response) =>
      sendChunks(response, chunks),
    );
    try {
      const response = await fetch(`${server.url}/api/pull`);

      expect((await readChunks(response)).join('')).toBe(chunks.join(''));
    } finally {
      await server.close();
    }
  });

  it('can be aborted mid-stream by the client', async () => {
    const server = await startTestServer((_request, response) =>
      sendChunks(response, ['{"a":1}\n', '{"a":2}\n'], {
        delayMs: 200,
        end: false,
      }),
    );
    try {
      const controller = new AbortController();
      const response = await fetch(`${server.url}/`, {
        signal: controller.signal,
      });
      const reading = readChunks(response);

      setTimeout(() => controller.abort(), 30);

      await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      await server.close();
    }
  });
});
