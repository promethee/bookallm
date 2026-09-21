// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from './client';
import { APPROX_MODEL_BYTES } from './defaults';
import { checkSetup, pullMissingModels } from './setup';
import {
  createFakeFetch,
  jsonResponse,
  ndjson,
  streamResponse,
} from './testing/fake-fetch';
import type { ModelPullProgress } from './types';

/** A simulated Ollama whose state changes as models are pulled. */
interface OllamaState {
  /** Undefined means Ollama is not reachable at all. */
  version?: string;
  installed: string[];
  /** When true, the version answers but the model list does not. */
  tagsFail?: boolean;
  /** Models whose pull ends with an error line, by name. */
  pullErrors?: Record<string, string>;
}

function simulate(state: OllamaState, baseUrl?: string) {
  const fake = createFakeFetch({
    'GET /api/version': () => {
      if (!state.version) throw new TypeError('fetch failed');
      return jsonResponse({ version: state.version });
    },
    'GET /api/tags': () => {
      if (state.tagsFail) throw new TypeError('fetch failed');
      return jsonResponse({
        models: state.installed.map((name) => ({ name })),
      });
    },
    'POST /api/pull': (request, signal) => {
      const { model } = JSON.parse(request.body!) as { model: string };
      const error = state.pullErrors?.[model];
      if (error)
        return streamResponse([
          ndjson({ status: 'pulling manifest' }, { error }),
        ]);
      state.installed.push(model.includes(':') ? model : `${model}:latest`);
      return streamResponse(
        [
          ndjson(
            { status: 'pulling manifest' },
            {
              status: 'pulling x',
              digest: `d-${model}`,
              total: 10,
              completed: 5,
            },
            {
              status: 'pulling x',
              digest: `d-${model}`,
              total: 10,
              completed: 10,
            },
            { status: 'success' },
          ),
        ],
        { signal },
      );
    },
  });
  return { fake, client: createOllamaClient({ fetch: fake.fetch, baseUrl }) };
}

const pulls = (fake: ReturnType<typeof simulate>['fake']) =>
  fake.requests
    .filter((r) => r.method === 'POST')
    .map((r) => (JSON.parse(r.body!) as { model: string }).model);

describe('checkSetup', () => {
  it('says get-ollama when Ollama is unreachable, without checking models', async () => {
    const { fake, client } = simulate({ installed: [] });

    expect(await checkSetup(client)).toEqual({ step: 'get-ollama' });
    expect(fake.requests.map((r) => r.path)).toEqual(['/api/version']);
  });

  it('says update-ollama with the versions when Ollama is too old', async () => {
    const { client } = simulate({ version: '0.3.3', installed: [] });

    expect(await checkSetup(client)).toEqual({
      step: 'update-ollama',
      version: '0.3.3',
      minimumVersion: '0.3.4',
    });
  });

  it('says pull-models with the plan when a model is missing', async () => {
    const { client } = simulate({
      version: '0.34.0',
      installed: ['bge-m3:latest'],
    });

    expect(await checkSetup(client)).toEqual({
      step: 'pull-models',
      version: '0.34.0',
      models: [
        { role: 'chat', model: 'llama3.1:8b', installed: false },
        { role: 'embedding', model: 'bge-m3', installed: true },
      ],
      plan: {
        items: [
          {
            role: 'chat',
            model: 'llama3.1:8b',
            approxBytes: APPROX_MODEL_BYTES['llama3.1:8b'],
          },
        ],
        totalKnownBytes: APPROX_MODEL_BYTES['llama3.1:8b'],
      },
    });
  });

  it('says ready when Ollama is recent and both models are installed', async () => {
    const { client } = simulate({
      version: '0.34.0',
      installed: ['llama3.1:8b', 'bge-m3:latest'],
    });

    expect(await checkSetup(client)).toEqual({
      step: 'ready',
      version: '0.34.0',
      models: [
        { role: 'chat', model: 'llama3.1:8b', installed: true },
        { role: 'embedding', model: 'bge-m3', installed: true },
      ],
    });
  });

  it('says get-ollama when Ollama answers the version but then stops answering', async () => {
    const { client } = simulate({
      version: '0.34.0',
      installed: [],
      tagsFail: true,
    });

    expect(await checkSetup(client)).toEqual({ step: 'get-ollama' });
  });

  it('puts the steps in priority order: an old Ollama is reported before missing models', async () => {
    const { client } = simulate({ version: '0.3.0', installed: [] });

    expect((await checkSetup(client)).step).toBe('update-ollama');
  });

  it('reflects Ollama being started when checked again', async () => {
    const state: OllamaState = { installed: ['llama3.1:8b', 'bge-m3:latest'] };
    const { client } = simulate(state);

    const before = await checkSetup(client);
    state.version = '0.34.0';
    const after = await checkSetup(client);

    expect(before.step).toBe('get-ollama');
    expect(after.step).toBe('ready');
  });

  it('reflects a finished download when checked again', async () => {
    const state: OllamaState = { version: '0.34.0', installed: [] };
    const { client } = simulate(state);

    const before = await checkSetup(client);
    await pullMissingModels(client);
    const after = await checkSetup(client);

    expect(before.step).toBe('pull-models');
    expect(after.step).toBe('ready');
  });

  it('only reads: checking makes no download request, however often it runs', async () => {
    const { fake, client } = simulate({ version: '0.34.0', installed: [] });

    await checkSetup(client);
    await checkSetup(client);

    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
  });
});

describe('pullMissingModels', () => {
  it('pulls both missing models one after another, embedding first, naming the one in progress', async () => {
    const { fake, client } = simulate({ version: '0.34.0', installed: [] });
    const updates: ModelPullProgress[] = [];

    const result = await pullMissingModels(client, undefined, {
      onProgress: (progress) => updates.push(progress),
    });

    expect(result).toEqual({
      status: 'success',
      pulled: ['bge-m3', 'llama3.1:8b'],
    });
    expect(pulls(fake)).toEqual(['bge-m3', 'llama3.1:8b']);
    const order = updates.map((u) => u.model);
    expect(
      order
        .slice(0, order.lastIndexOf('bge-m3') + 1)
        .every((m) => m === 'bge-m3'),
    ).toBe(true);
    expect(order.at(-1)).toBe('llama3.1:8b');
    expect(updates.at(-1)?.phase).toBe('done');
  });

  it('pulls only the model that is missing', async () => {
    const { fake, client } = simulate({
      version: '0.34.0',
      installed: ['bge-m3:latest'],
    });

    const result = await pullMissingModels(client);

    expect(result).toEqual({ status: 'success', pulled: ['llama3.1:8b'] });
    expect(pulls(fake)).toEqual(['llama3.1:8b']);
  });

  it('pulls nothing when everything is installed', async () => {
    const { fake, client } = simulate({
      version: '0.34.0',
      installed: ['llama3.1:8b', 'bge-m3:latest'],
    });

    expect(await pullMissingModels(client)).toEqual({
      status: 'success',
      pulled: [],
    });
    expect(pulls(fake)).toEqual([]);
  });

  it('stops at the first failure and does not start the next model', async () => {
    const { fake, client } = simulate({
      version: '0.34.0',
      installed: [],
      pullErrors: { 'bge-m3': 'pull model manifest: file does not exist' },
    });

    const result = await pullMissingModels(client);

    expect(result).toEqual({
      status: 'failed',
      pulled: [],
      model: 'bge-m3',
      error: {
        code: 'model-not-found',
        detail: 'pull model manifest: file does not exist',
      },
    });
    expect(pulls(fake)).toEqual(['bge-m3']);
  });

  it('keeps the models already pulled when a later one fails', async () => {
    const { client } = simulate({
      version: '0.34.0',
      installed: [],
      pullErrors: { 'llama3.1:8b': 'unexpected EOF' },
    });

    const result = await pullMissingModels(client);

    expect(result).toMatchObject({
      status: 'failed',
      pulled: ['bge-m3'],
      model: 'llama3.1:8b',
    });
  });

  it('stops when cancelled and starts no later model', async () => {
    const { fake, client } = simulate({ version: '0.34.0', installed: [] });
    const controller = new AbortController();

    const result = await pullMissingModels(client, undefined, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    expect(result).toEqual({
      status: 'cancelled',
      pulled: [],
      model: 'bge-m3',
    });
    expect(pulls(fake)).toEqual(['bge-m3']);
  });

  it('fails as unreachable when the model list cannot be read', async () => {
    const { client } = simulate({
      version: '0.34.0',
      installed: [],
      tagsFail: true,
    });

    expect(await pullMissingModels(client)).toEqual({
      status: 'failed',
      pulled: [],
      error: { code: 'unreachable' },
    });
  });
});

describe('a substituted model and a custom address flow through everything', () => {
  const custom = { chat: 'qwen2.5:3b', embedding: 'nomic-embed-text' };

  it('counts the substituted chat model as present and does not require the default', async () => {
    const { client } = simulate({
      version: '0.34.0',
      installed: ['qwen2.5:3b', 'nomic-embed-text:latest'],
    });

    const readiness = await checkSetup(client, custom);

    expect(readiness.step).toBe('ready');
  });

  it('plans and pulls the substituted names, at the custom address, and nothing else', async () => {
    const state: OllamaState = {
      version: '0.34.0',
      installed: ['nomic-embed-text:latest'],
    };
    const { fake, client } = simulate(state, 'http://ollama.lan:9999');

    const readiness = await checkSetup(client, custom);
    const result = await pullMissingModels(client, custom);

    expect(readiness).toMatchObject({
      step: 'pull-models',
      plan: {
        items: [{ role: 'chat', model: 'qwen2.5:3b' }],
        totalKnownBytes: 0,
      },
    });
    expect(result).toEqual({ status: 'success', pulled: ['qwen2.5:3b'] });
    expect(pulls(fake)).toEqual(['qwen2.5:3b']);
    expect(
      fake.requests.every((r) => r.url.startsWith('http://ollama.lan:9999/')),
    ).toBe(true);
    expect(await checkSetup(client, custom)).toMatchObject({ step: 'ready' });
  });
});
