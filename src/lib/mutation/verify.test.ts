// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  ndjson,
  streamResponse,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import { verifyContradiction } from './verify';

const clientFor = (handler: FakeHandler) => {
  const fake = createFakeFetch({ 'POST /api/chat': handler });
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const scripted = (content: string) =>
  streamResponse([
    ndjson({ message: { role: 'assistant', content }, done: false }),
    ndjson({ message: { role: 'assistant', content: '' }, done: true }),
  ]);

describe('verifyContradiction', () => {
  it('confirms a contradiction', async () => {
    const { client } = clientFor(() => scripted('CONTRADICTS'));

    expect(
      await verifyContradiction(client, 'llama3.1:8b', 'passage', 'claim'),
    ).toEqual({ status: 'ok', confirmed: true });
  });

  it('does not confirm a claim the model says matches', async () => {
    const { client } = clientFor(() => scripted('MATCHES'));

    expect(
      await verifyContradiction(client, 'llama3.1:8b', 'passage', 'claim'),
    ).toEqual({ status: 'ok', confirmed: false });
  });

  it('does not confirm an unparseable answer', async () => {
    const { client } = clientFor(() =>
      scripted('I am not sure about this one.'),
    );

    expect(
      await verifyContradiction(client, 'llama3.1:8b', 'passage', 'claim'),
    ).toEqual({ status: 'ok', confirmed: false });
  });
});
