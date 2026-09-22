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
import {
  DEFAULT_EMBED_DIMENSION,
  fakeEmbedding,
  simulateOllama,
  type OllamaState,
} from './simulated-ollama';
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
      {
        method: 'GET',
        url: 'http://localhost:11434/api/version',
        path: '/api/version',
        body: undefined,
      },
      {
        method: 'POST',
        url: 'http://localhost:11434/api/pull',
        path: '/api/pull',
        body: '{"model":"x"}',
      },
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

describe('simulated embeddings', () => {
  const embed = (
    state: OllamaState,
    input: string[],
    model = 'bge-m3',
    signal?: AbortSignal,
  ) =>
    simulateOllama(state).fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      body: JSON.stringify({ model, input }),
      signal,
    });

  it('gives equal texts equal vectors and different texts different ones', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
    };

    const response = await embed(state, [
      'The cat sat.',
      'the CAT sat',
      'Dogs bark',
    ]);
    const { embeddings } = (await response.json()) as {
      embeddings: number[][];
    };

    expect(embeddings).toHaveLength(3);
    expect(embeddings[0]).toEqual(embeddings[1]);
    expect(embeddings[0]).not.toEqual(embeddings[2]);
    expect(embeddings[0]).toHaveLength(DEFAULT_EMBED_DIMENSION);
    expect(fakeEmbedding('The cat sat.')).toEqual(embeddings[0]);
  });

  it('makes unit vectors, even for text without words', () => {
    for (const text of ['Some words here', '...', '']) {
      const norm = Math.hypot(...fakeEmbedding(text));
      expect(norm).toBeCloseTo(1);
    }
  });

  it('follows the chosen vector length', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
      embedDimension: 3,
    };

    const { embeddings } = (await (await embed(state, ['a'])).json()) as {
      embeddings: number[][];
    };

    expect(embeddings[0]).toHaveLength(3);
  });

  it('answers 404 for a model that is not installed, also for an untagged name', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
    };

    expect((await embed(state, ['a'], 'bge-m3')).status).toBe(200);
    const missing = await embed(state, ['a'], 'nomic-embed-text');

    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: 'model "nomic-embed-text" not found, try pulling it first',
    });
  });

  it('answers chosen texts with fixed vectors and every other text with the word-based ones', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
      embedFixed: { 'a chosen question': [1, 0, 0] },
    };

    const { embeddings } = (await (
      await embed(state, ['a chosen question', 'The cat sat.'])
    ).json()) as { embeddings: number[][] };

    expect(embeddings[0]).toEqual([1, 0, 0]);
    expect(embeddings[1]).toEqual(fakeEmbedding('The cat sat.'));
  });

  it('can answer with one vector too few', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
      embedWrongCount: true,
    };

    const { embeddings } = (await (await embed(state, ['a', 'b'])).json()) as {
      embeddings: number[][];
    };

    expect(embeddings).toHaveLength(1);
  });

  it('drops the connection after the chosen number of requests and counts them', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
      embedDropAfter: 2,
    };

    expect((await embed(state, ['a'])).status).toBe(200);
    expect((await embed(state, ['a'])).status).toBe(200);
    await expect(embed(state, ['a'])).rejects.toBeInstanceOf(TypeError);
    expect(state.embedCalls).toBe(3);
  });

  it('stalls until the request is aborted', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
      embedStall: true,
    };
    const controller = new AbortController();

    const pending = embed(state, ['a'], 'bge-m3', controller.signal);
    controller.abort();

    await expect(pending).rejects.toBeDefined();
  });
});

describe('simulated chat', () => {
  const chat = (
    state: OllamaState,
    question = 'a question',
    model = 'llama3.1:8b',
    signal?: AbortSignal,
  ) =>
    simulateOllama(state).fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'passages...' },
          { role: 'user', content: question },
        ],
      }),
      signal,
    });

  it('streams a default answer that echoes the question and cites passage 1', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['llama3.1:8b'],
    };

    const response = await chat(state, 'why does she say that');
    const lines = (await readChunks(response))
      .join('')
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as { message?: { content: string }; done?: boolean },
      );

    expect(
      lines
        .slice(0, -1)
        .map((line) => line.message!.content)
        .join(''),
    ).toBe('Answer: why does she say that [1]');
    expect(lines.at(-1)).toEqual({
      message: { role: 'assistant', content: '' },
      done: true,
    });
  });

  it('streams the scripted chunks instead, when given', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['llama3.1:8b'],
      chatChunks: ['one', ' two', ' three'],
    };

    const response = await chat(state);
    const lines = (await readChunks(response)).join('').trim().split('\n');

    expect(lines).toHaveLength(4);
    expect(
      lines
        .slice(0, 3)
        .map(
          (line) =>
            (JSON.parse(line) as { message: { content: string } }).message
              .content,
        ),
    ).toEqual(['one', ' two', ' three']);
  });

  it('answers 404 for a model that is not installed', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['bge-m3:latest'],
    };

    const response = await chat(state, 'x', 'llama3.1:8b');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'model "llama3.1:8b" not found, try pulling it first',
    });
  });

  it('can end the stream with an error line instead of done', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['llama3.1:8b'],
      chatChunks: ['partial'],
      chatError: 'boom',
    };

    const response = await chat(state);
    const lines = (await readChunks(response)).join('').trim().split('\n');

    expect(JSON.parse(lines.at(-1)!)).toEqual({ error: 'boom' });
  });

  it('drops the connection after the chosen number of requests and counts them', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['llama3.1:8b'],
      chatDropAfter: 1,
    };

    expect((await chat(state)).status).toBe(200);
    await expect(chat(state)).rejects.toBeInstanceOf(TypeError);
    expect(state.chatCalls).toBe(2);
  });

  it('stalls until the request is aborted', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['llama3.1:8b'],
      chatStall: true,
    };
    const controller = new AbortController();

    const pending = chat(state, 'x', 'llama3.1:8b', controller.signal);
    controller.abort();

    await expect(pending).rejects.toBeDefined();
  });

  it('paces the scripted chunks apart when a delay is set', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['llama3.1:8b'],
      chatChunks: ['a', 'b'],
      chatDelayMs: 5,
    };

    const started = Date.now();
    await readChunks(await chat(state));

    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
  });
});
