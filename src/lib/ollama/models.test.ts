// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from './client';
import { APPROX_MODEL_BYTES } from './defaults';
import {
  checkModels,
  normalizeModelName,
  planDownloads,
  readInstalledModels,
} from './models';
import {
  createFakeFetch,
  jsonResponse,
  type FakeHandler,
} from './testing/fake-fetch';
import type { ModelReport } from './types';

const tags = (...names: string[]) =>
  jsonResponse({ models: names.map((name) => ({ name })) });

function clientWith(handler: FakeHandler) {
  const fake = createFakeFetch({ 'GET /api/tags': handler });
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
}

describe('normalizeModelName', () => {
  it.each([
    ['bge-m3', 'bge-m3:latest'],
    ['bge-m3:latest', 'bge-m3:latest'],
    ['BGE-M3:Latest', 'bge-m3:latest'],
    ['  llama3.1:8b  ', 'llama3.1:8b'],
    ['llama3.1:70b', 'llama3.1:70b'],
    ['localhost:5000/team/model', 'localhost:5000/team/model:latest'],
    ['hf.co/user/model:q4_k_m', 'hf.co/user/model:q4_k_m'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeModelName(input)).toBe(expected);
  });
});

describe('readInstalledModels', () => {
  it('returns the normalised names Ollama lists', async () => {
    const { client } = clientWith(() => tags('bge-m3:latest', 'Qwen2.5:3b'));

    expect(await readInstalledModels(client)).toEqual([
      'bge-m3:latest',
      'qwen2.5:3b',
    ]);
  });

  it('returns an empty list for a real but empty installation', async () => {
    const { client } = clientWith(() => tags());

    expect(await readInstalledModels(client)).toEqual([]);
  });

  it.each([
    ['an error status', () => jsonResponse({ models: [] }, 500)],
    ['a body that is not JSON', () => new Response('nope')],
    ['a body without a model list', () => jsonResponse({ hello: 'world' })],
    ['a model list that is not a list', () => jsonResponse({ models: 'no' })],
  ])('cannot read the list from %s', async (_name, handler) => {
    const { client } = clientWith(handler);

    expect(await readInstalledModels(client)).toBeUndefined();
  });

  it('skips entries without a name', async () => {
    const { client } = clientWith(() =>
      jsonResponse({ models: [{}, { name: 'a:1' }, null] }),
    );

    expect(await readInstalledModels(client)).toEqual(['a:1']);
  });

  it('cannot read the list when the connection is refused', async () => {
    const client = createOllamaClient({ fetch: createFakeFetch({}).fetch });

    expect(await readInstalledModels(client)).toBeUndefined();
  });
});

describe('checkModels', () => {
  it('counts an untagged required name as the latest tag', async () => {
    const { client } = clientWith(() => tags('bge-m3:latest', 'llama3.1:8b'));

    const result = await checkModels(client);

    expect(result).toEqual({
      ok: true,
      models: [
        { role: 'chat', model: 'llama3.1:8b', installed: true },
        { role: 'embedding', model: 'bge-m3', installed: true },
      ],
    });
  });

  it('does not count a different tag of the same model', async () => {
    const { client } = clientWith(() => tags('llama3.1:70b', 'bge-m3:latest'));

    const result = await checkModels(client);

    expect(result.ok && result.models[0]).toEqual({
      role: 'chat',
      model: 'llama3.1:8b',
      installed: false,
    });
  });

  it('ignores letter case in installed names', async () => {
    const { client } = clientWith(() => tags('LLaMA3.1:8B', 'BGE-M3'));

    const result = await checkModels(client);

    expect(result.ok && result.models.every((m) => m.installed)).toBe(true);
  });

  it('reports the partly-set-up case: embedding installed, chat missing', async () => {
    const { client } = clientWith(() => tags('bge-m3:latest', 'qwen2.5:3b'));

    const result = await checkModels(client);

    expect(result).toEqual({
      ok: true,
      models: [
        { role: 'chat', model: 'llama3.1:8b', installed: false },
        { role: 'embedding', model: 'bge-m3', installed: true },
      ],
    });
  });

  it('checks the substituted model names it is given', async () => {
    const { client } = clientWith(() =>
      tags('qwen2.5:3b', 'nomic-embed-text:latest'),
    );

    const result = await checkModels(client, {
      chat: 'qwen2.5:3b',
      embedding: 'nomic-embed-text',
    });

    expect(result.ok && result.models.every((m) => m.installed)).toBe(true);
  });

  it('is an unreachable error, not "nothing installed", when the list cannot be read', async () => {
    const client = createOllamaClient({ fetch: createFakeFetch({}).fetch });

    expect(await checkModels(client)).toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
  });

  it('is an unreachable error when Ollama answers the list with an error', async () => {
    const { client } = clientWith(() => jsonResponse({ error: 'boom' }, 500));

    expect(await checkModels(client)).toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
  });
});

describe('planDownloads', () => {
  const report = (chat: boolean, embedding: boolean): ModelReport => [
    { role: 'chat', model: 'llama3.1:8b', installed: chat },
    { role: 'embedding', model: 'bge-m3', installed: embedding },
  ];

  it('lists only the missing models with their approximate sizes', () => {
    expect(planDownloads(report(false, true))).toEqual({
      items: [
        {
          role: 'chat',
          model: 'llama3.1:8b',
          approxBytes: APPROX_MODEL_BYTES['llama3.1:8b'],
        },
      ],
      totalKnownBytes: APPROX_MODEL_BYTES['llama3.1:8b'],
    });
  });

  it('totals both models when both are missing', () => {
    const plan = planDownloads(report(false, false));

    expect(plan.items.map((item) => item.model)).toEqual([
      'llama3.1:8b',
      'bge-m3',
    ]);
    expect(plan.totalKnownBytes).toBe(
      APPROX_MODEL_BYTES['llama3.1:8b'] + APPROX_MODEL_BYTES['bge-m3:latest'],
    );
  });

  it('lists a model of unknown size without a size and leaves it out of the total', () => {
    const plan = planDownloads([
      { role: 'chat', model: 'some-custom-model:7b', installed: false },
      { role: 'embedding', model: 'bge-m3', installed: false },
    ]);

    expect(plan.items[0]).toEqual({
      role: 'chat',
      model: 'some-custom-model:7b',
    });
    expect(plan.totalKnownBytes).toBe(APPROX_MODEL_BYTES['bge-m3:latest']);
  });

  it('is empty when everything is installed', () => {
    expect(planDownloads(report(true, true))).toEqual({
      items: [],
      totalKnownBytes: 0,
    });
  });

  it('downloads nothing: checking and planning make only the one read request', async () => {
    const { fake, client } = clientWith(() => tags('bge-m3:latest'));

    const result = await checkModels(client);
    if (!result.ok) throw new Error('unexpected');
    planDownloads(result.models);

    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/tags',
    ]);
  });
});
