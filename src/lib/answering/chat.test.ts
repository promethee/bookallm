// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  jsonResponse,
  ndjson,
  neverAnswers,
  streamResponse,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import { classifyChatError, streamChat, toChatEvent } from './chat';

const clientFor = (routes: Record<string, FakeHandler>) => {
  const fake = createFakeFetch(routes);
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const chatRoute = (handler: FakeHandler): Record<string, FakeHandler> => ({
  'POST /api/chat': handler,
});

const scripted = (...lines: unknown[]) =>
  chatRoute(() => streamResponse([ndjson(...lines)]));

const MESSAGES = [
  { role: 'system' as const, content: 'passages...' },
  { role: 'user' as const, content: 'a question' },
];

const SUCCESS_LINES = [
  { message: { role: 'assistant', content: 'The ' }, done: false },
  { message: { role: 'assistant', content: 'cat ' }, done: false },
  { message: { role: 'assistant', content: 'sat.' }, done: false },
  { message: { role: 'assistant', content: '' }, done: true },
];

/** Drains a generator, tolerating a thrown `AnswerError`. */
async function drain(chunks: AsyncGenerator<string, void, undefined>) {
  const text: string[] = [];
  try {
    for await (const chunk of chunks) text.push(chunk);
    return { text, error: undefined };
  } catch (error) {
    return { text, error };
  }
}

describe('streamChat: success', () => {
  it('sends the model, messages and stream:true to /api/chat', async () => {
    const { fake, client } = clientFor(scripted(...SUCCESS_LINES));

    await streamChat(client, 'llama3.1:8b', MESSAGES);

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/chat',
    });
    expect(JSON.parse(fake.requests[0].body!)).toEqual({
      model: 'llama3.1:8b',
      messages: MESSAGES,
      stream: true,
    });
  });

  it('yields the answer’s text pieces in order', async () => {
    const { client } = clientFor(scripted(...SUCCESS_LINES));

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(await drain(result.chunks)).toEqual({
      text: ['The ', 'cat ', 'sat.'],
      error: undefined,
    });
  });

  it('reads chunks split across several stream pieces the same way', async () => {
    const { client } = clientFor(
      chatRoute(() =>
        streamResponse(SUCCESS_LINES.map((line) => ndjson(line))),
      ),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES);

    if (result.status !== 'ok') throw new Error('expected ok');
    expect((await drain(result.chunks)).text.join('')).toBe('The cat sat.');
  });
});

describe('streamChat: failures known before any text arrives', () => {
  it('reports a model that is not installed as model-not-found', async () => {
    const { client } = clientFor(
      chatRoute(() =>
        jsonResponse(
          { error: 'model "llama3.1:8b" not found, try pulling it first' },
          404,
        ),
      ),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES);

    expect(result).toEqual({
      status: 'failed',
      error: {
        code: 'model-not-found',
        detail: 'model "llama3.1:8b" not found, try pulling it first',
      },
    });
  });

  it('keeps Ollama’s message for another error', async () => {
    const { client } = clientFor(
      chatRoute(() => jsonResponse({ error: 'out of memory' }, 500)),
    );

    expect(await streamChat(client, 'llama3.1:8b', MESSAGES)).toEqual({
      status: 'failed',
      error: { code: 'chat-failed', detail: 'out of memory' },
    });
  });

  it('reports a refused connection as unreachable', async () => {
    const { client } = clientFor({});

    expect(await streamChat(client, 'llama3.1:8b', MESSAGES)).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it('reports no response body as a typed failure', async () => {
    const { client } = clientFor(
      chatRoute(() => new Response(null, { status: 200 })),
    );

    expect(await streamChat(client, 'llama3.1:8b', MESSAGES)).toEqual({
      status: 'failed',
      error: { code: 'chat-failed', detail: 'No response body' },
    });
  });

  it('does not send a request when already aborted', async () => {
    const { fake, client } = clientFor(scripted(...SUCCESS_LINES));

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES, {
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ status: 'aborted' });
    expect(fake.requests).toHaveLength(0);
  });

  it('reports an unanswered request as unreachable after the time limit', async () => {
    const { client } = clientFor(chatRoute(neverAnswers));

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES, {
      timeoutMs: 20,
    });

    expect(result).toEqual({
      status: 'failed',
      error: { code: 'unreachable', detail: 'Ollama did not answer in time' },
    });
  });

  it('gives aborted, not a failure, when the caller aborts before a response arrives', async () => {
    const { client } = clientFor(chatRoute(neverAnswers));
    const controller = new AbortController();

    const pending = streamChat(client, 'llama3.1:8b', MESSAGES, {
      signal: controller.signal,
    });
    controller.abort();

    expect(await pending).toEqual({ status: 'aborted' });
  });
});

describe('streamChat: failures during the stream', () => {
  it('throws a typed error from the generator when Ollama sends an error line', async () => {
    const { client } = clientFor(
      scripted(
        { message: { role: 'assistant', content: 'partial' }, done: false },
        { error: 'boom' },
      ),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES);

    if (result.status !== 'ok') throw new Error('expected ok');
    expect(await drain(result.chunks)).toEqual({
      text: ['partial'],
      error: { code: 'chat-failed', detail: 'boom' },
    });
  });

  it('throws unreachable when the connection drops mid-stream', async () => {
    const { client } = clientFor(
      chatRoute(() =>
        streamResponse(
          [
            ndjson({
              message: { role: 'assistant', content: 'partial' },
              done: false,
            }),
          ],
          // A real delay, so the already-enqueued chunk is actually read before the
          // stream errors: erroring a stream discards data queued but not yet pulled.
          { failWith: new TypeError('terminated'), delayMs: 5 },
        ),
      ),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES);

    if (result.status !== 'ok') throw new Error('expected ok');
    const { text, error } = await drain(result.chunks);
    expect(text).toEqual(['partial']);
    expect(error).toMatchObject({ code: 'unreachable' });
  });

  it('throws unreachable when the stream ends without a done line', async () => {
    const { client } = clientFor(
      scripted({
        message: { role: 'assistant', content: 'partial' },
        done: false,
      }),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES);

    if (result.status !== 'ok') throw new Error('expected ok');
    expect(await drain(result.chunks)).toEqual({
      text: ['partial'],
      error: {
        code: 'unreachable',
        detail: 'The answer ended before it finished',
      },
    });
  });

  it('throws unreachable when the stream stalls past the timeout, after some text', async () => {
    const { client } = clientFor(
      chatRoute((request, signal) =>
        streamResponse(
          [
            ndjson({
              message: { role: 'assistant', content: 'partial' },
              done: false,
            }),
          ],
          { stall: true, signal },
        ),
      ),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES, {
      timeoutMs: 20,
    });

    if (result.status !== 'ok') throw new Error('expected ok');
    const { text, error } = await drain(result.chunks);
    expect(text).toEqual(['partial']);
    expect(error).toEqual({
      code: 'unreachable',
      detail: 'Ollama did not answer in time',
    });
  });

  it('resets the timeout on every chunk, so a slow-but-steady answer is not cut off', async () => {
    const { client } = clientFor(
      chatRoute(() =>
        streamResponse(
          SUCCESS_LINES.map((line) => ndjson(line)),
          { delayMs: 15 },
        ),
      ),
    );

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES, {
      timeoutMs: 40,
    });

    if (result.status !== 'ok') throw new Error('expected ok');
    // 4 lines x 15 ms > the 40 ms timeout, so this only passes if each chunk resets it.
    const { text, error } = await drain(result.chunks);
    expect(text).toEqual(['The ', 'cat ', 'sat.']);
    expect(error).toBeUndefined();
  });
});

describe('streamChat: abort mid-stream', () => {
  it('ends the generator quietly when aborted, with no error', async () => {
    const { client } = clientFor(
      chatRoute((request, signal) =>
        streamResponse(
          [
            ndjson({
              message: { role: 'assistant', content: 'partial' },
              done: false,
            }),
          ],
          { stall: true, signal },
        ),
      ),
    );
    const controller = new AbortController();

    const result = await streamChat(client, 'llama3.1:8b', MESSAGES, {
      signal: controller.signal,
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    const pending = drain(result.chunks);
    setTimeout(() => controller.abort(), 20);

    expect(await pending).toEqual({ text: ['partial'], error: undefined });
  });
});

describe('classifyChatError', () => {
  it('tells a missing model from another failure', () => {
    expect(classifyChatError('model "x" not found', 404).code).toBe(
      'model-not-found',
    );
    expect(classifyChatError('internal error').code).toBe('chat-failed');
  });
});

describe('toChatEvent', () => {
  it('reads content, done and error, and ignores anything else', () => {
    expect(toChatEvent({ message: { content: 'hi' }, done: false })).toEqual({
      content: 'hi',
      done: false,
    });
    expect(toChatEvent({ error: 'boom' })).toEqual({ error: 'boom' });
    expect(toChatEvent({ other: 1 })).toEqual({});
  });

  it.each([undefined, null, 'x', 3])('is undefined for %j', (value) => {
    expect(toChatEvent(value)).toBeUndefined();
  });
});
