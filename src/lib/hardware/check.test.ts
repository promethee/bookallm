// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  jsonResponse,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import { checkAcceleration } from './check';

const clientFor = (routes: Record<string, FakeHandler>) => {
  const fake = createFakeFetch(routes);
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const psWith = (model: string, size: number, sizeVram: number) => ({
  'GET /api/ps': () =>
    jsonResponse({ models: [{ model, size, size_vram: sizeVram }] }),
});

const embedOk = {
  'POST /api/embed': () => jsonResponse({ embeddings: [[1, 0]] }),
};

describe('checkAcceleration', () => {
  it('reports accelerated when size_vram equals the model size', async () => {
    const { client } = clientFor({
      ...embedOk,
      ...psWith('bge-m3:latest', 1_000, 1_000),
    });

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'accelerated',
    });
  });

  it('reports not-accelerated when size_vram is zero', async () => {
    const { client } = clientFor({
      ...embedOk,
      ...psWith('bge-m3:latest', 1_000, 0),
    });

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'not-accelerated',
    });
  });

  it('reports inconclusive on a refused connection', async () => {
    const { client } = clientFor({});

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'inconclusive',
    });
  });

  it('reports inconclusive when the embed request itself fails', async () => {
    const { client } = clientFor({
      'POST /api/embed': () => jsonResponse({ error: 'boom' }, 500),
    });

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'inconclusive',
    });
  });

  it('reports inconclusive when /api/ps has no matching entry', async () => {
    const { client } = clientFor({
      ...embedOk,
      'GET /api/ps': () => jsonResponse({ models: [] }),
    });

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'inconclusive',
    });
  });

  it('reports inconclusive when /api/ps itself fails', async () => {
    const { client } = clientFor({
      ...embedOk,
      'GET /api/ps': () => jsonResponse({ error: 'boom' }, 500),
    });

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'inconclusive',
    });
  });

  it('reports inconclusive when the caller aborts', async () => {
    const { client } = clientFor({
      ...embedOk,
      ...psWith('bge-m3:latest', 1_000, 1_000),
    });

    expect(
      await checkAcceleration(client, 'bge-m3', AbortSignal.abort()),
    ).toEqual({ status: 'inconclusive' });
  });

  it('matches the model name ignoring case and a missing tag', async () => {
    const { client } = clientFor({
      ...embedOk,
      ...psWith('BGE-M3:LATEST', 1_000, 1_000),
    });

    expect(await checkAcceleration(client, 'bge-m3', undefined)).toEqual({
      status: 'accelerated',
    });
  });
});
