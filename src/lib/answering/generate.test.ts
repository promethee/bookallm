// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ChunkLocator } from '../ingest/types';
import { createOllamaClient } from '../ollama';
import {
  simulateOllama,
  type OllamaState,
} from '../ollama/testing/simulated-ollama';
import type { Passage } from '../retrieval';
import { generateAnswer, type GenerateAnswerResult } from './generate';

function setup(overrides: Partial<OllamaState> = {}, baseUrl?: string) {
  const state: OllamaState = {
    version: '0.34.0',
    installed: ['llama3.1:8b'],
    ...overrides,
  };
  const fake = simulateOllama(state);
  const client = createOllamaClient({ fetch: fake.fetch, baseUrl });
  return { state, fake, client };
}

type Env = ReturnType<typeof setup>;

const chatRequests = (env: Env) =>
  env.fake.requests.filter((request) => request.path === '/api/chat');

const locator = (n: number): ChunkLocator => ({
  chapterNumber: n,
  chapterTitle: `Chapter ${n}`,
  paragraphStart: 0,
  paragraphEnd: 0,
  charStart: 0,
  charEnd: 20,
});

const passages = (count: number): Passage[] =>
  Array.from({ length: count }, (_, i) => ({
    chunkId: `chunk-${i + 1}`,
    text: `Content of passage ${i + 1}.`,
    locator: locator(i + 1),
    score: 1 - i * 0.1,
  }));

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

function ask(
  env: Env,
  extra: Partial<Parameters<typeof generateAnswer>[0]> = {},
): Promise<GenerateAnswerResult> {
  return generateAnswer({
    verdict: 'relevant',
    question: 'Why did she say that?',
    passages: passages(2),
    model: 'llama3.1:8b',
    client: env.client,
    language: 'en',
    ...extra,
  });
}

describe('generateAnswer: the prompt', () => {
  it('numbers and includes every offered passage, and sends the question', async () => {
    const env = setup();

    await ask(env);

    const body = JSON.parse(chatRequests(env)[0].body!) as {
      messages: { role: string; content: string }[];
    };
    const system = body.messages[0].content;
    expect(system).toContain('[1] Content of passage 1.');
    expect(system).toContain('[2] Content of passage 2.');
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: 'Why did she say that?',
    });
  });

  it('numbers the passages in the order given, not by score', async () => {
    const env = setup();
    const given = [passages(2)[1], passages(2)[0]]; // reversed

    await ask(env, { passages: given });

    const system = (
      JSON.parse(chatRequests(env)[0].body!) as {
        messages: { content: string }[];
      }
    ).messages[0].content;
    expect(system.indexOf('[1] Content of passage 2.')).toBeLessThan(
      system.indexOf('[2] Content of passage 1.'),
    );
  });
});

describe('generateAnswer: the streamed answer and its citations', () => {
  it('joins the streamed chunks into the full answer text, in order', async () => {
    const env = setup({ chatChunks: ['She ', 'was ', 'wrong', '[1].'] });

    const result = await ask(env);

    if (result.status !== 'ok') throw new Error('expected ok');
    const { text } = await drain(result.chunks);
    expect(text.join('')).toBe('She was wrong[1].');
  });

  it('resolves citations from the markers actually produced', async () => {
    const env = setup({ chatChunks: ['First[1], second[2].'] });

    const result = await ask(env);
    if (result.status !== 'ok') throw new Error('expected ok');
    await drain(result.chunks);

    expect(result.citations()).toEqual([
      {
        passageIndex: 1,
        chunkId: 'chunk-1',
        locator: locator(1),
        offset: 5,
      },
      {
        passageIndex: 2,
        chunkId: 'chunk-2',
        locator: locator(2),
        offset: 16,
      },
    ]);
  });

  it('drops a citation number the model invented that was not offered', async () => {
    const env = setup({ chatChunks: ['A claim[9].'] });

    const result = await ask(env);
    if (result.status !== 'ok') throw new Error('expected ok');
    await drain(result.chunks);

    expect(result.citations()).toEqual([]);
  });

  it('reads as an empty citation list before the stream is drained', async () => {
    const env = setup({ chatChunks: ['[1] cited'] });

    const result = await ask(env);
    if (result.status !== 'ok') throw new Error('expected ok');

    expect(result.citations()).toEqual([]);
  });

  it('gives the default answer, citing passage 1, when nothing is scripted', async () => {
    const env = setup();

    const result = await ask(env);
    if (result.status !== 'ok') throw new Error('expected ok');
    const { text } = await drain(result.chunks);

    expect(text.join('')).toContain('[1]');
    expect(result.citations().map((c) => c.passageIndex)).toEqual([1]);
  });
});

describe('generateAnswer: nothing relevant', () => {
  it('calls nothing and returns the fixed reply, with no citations', async () => {
    const env = setup();

    const result = await ask(env, { verdict: 'nothing-relevant' });

    if (result.status !== 'ok') throw new Error('expected ok');
    const { text } = await drain(result.chunks);
    expect(text).toEqual([
      'I can’t find anything about that: could you tell me where in the book that comes up?',
    ]);
    expect(result.citations()).toEqual([]);
    expect(chatRequests(env)).toHaveLength(0);
  });

  it('gives the French reply in French', async () => {
    const env = setup();

    const result = await ask(env, {
      verdict: 'nothing-relevant',
      language: 'fr',
    });

    if (result.status !== 'ok') throw new Error('expected ok');
    const { text } = await drain(result.chunks);
    expect(text).toEqual([
      'Je ne trouve rien à ce sujet : pouvez-vous me dire à quel endroit du livre cela se trouve ?',
    ]);
  });

  it('sends no request even when there are passages to offer', async () => {
    const env = setup();

    await ask(env, { verdict: 'nothing-relevant', passages: passages(3) });

    expect(chatRequests(env)).toHaveLength(0);
  });
});

describe('generateAnswer: failures', () => {
  it('reports Ollama being unreachable, known before any text arrives', async () => {
    const env = setup({ installed: [] });

    expect(await ask(env)).toMatchObject({
      status: 'failed',
      error: { code: 'model-not-found' },
    });
  });

  it('reports a refused connection as unreachable', async () => {
    const env = setup({ chatDropAfter: 0 });

    expect(await ask(env)).toMatchObject({
      status: 'failed',
      error: { code: 'unreachable' },
    });
  });

  it('throws from the generator for a mid-stream error, keeping the text so far', async () => {
    const env = setup({ chatChunks: ['partial'], chatError: 'boom' });

    const result = await ask(env);
    if (result.status !== 'ok') throw new Error('expected ok');
    const { text, error } = await drain(result.chunks);

    expect(text).toEqual(['partial']);
    expect(error).toEqual({ code: 'chat-failed', detail: 'boom' });
  });
});

describe('generateAnswer: abort', () => {
  it('gives aborted, not a failure, when already aborted, even for nothing-relevant', async () => {
    const env = setup();

    const result = await ask(env, {
      verdict: 'nothing-relevant',
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ status: 'aborted' });
  });

  it('does not send a request when already aborted', async () => {
    const env = setup();

    const result = await ask(env, { signal: AbortSignal.abort() });

    expect(result).toEqual({ status: 'aborted' });
    expect(chatRequests(env)).toHaveLength(0);
  });

  it('ends the generator quietly when aborted mid-stream, keeping the citations of the text so far', async () => {
    const env = setup({
      chatChunks: ['claim[1]', ' more'],
      chatStallAfterChunks: 1,
    });
    const controller = new AbortController();

    const result = await ask(env, { signal: controller.signal });
    if (result.status !== 'ok') throw new Error('expected ok');
    const pending = drain(result.chunks);
    setTimeout(() => controller.abort(), 10);

    expect(await pending).toEqual({ text: ['claim[1]'], error: undefined });
    expect(result.citations()).toEqual([
      { passageIndex: 1, chunkId: 'chunk-1', locator: locator(1), offset: 5 },
    ]);
  });
});

describe('generateAnswer: what it touches', () => {
  it('sends the question and passages only to the configured address', async () => {
    const env = setup({}, 'http://ollama.example:9999');

    await ask(env);

    expect(env.fake.requests.map((request) => request.url)).toEqual([
      'http://ollama.example:9999/api/chat',
    ]);
  });

  it('sends nothing anywhere for a nothing-relevant verdict', async () => {
    const env = setup({}, 'http://ollama.example:9999');

    await ask(env, { verdict: 'nothing-relevant' });

    expect(env.fake.requests).toHaveLength(0);
  });
});
