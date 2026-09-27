// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  ndjson,
  streamResponse,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import { extractClaim } from './extract';

const clientFor = (handler: FakeHandler) => {
  const fake = createFakeFetch({ 'POST /api/chat': handler });
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const scripted = (content: string) =>
  streamResponse([
    ndjson({ message: { role: 'assistant', content }, done: false }),
    ndjson({ message: { role: 'assistant', content: '' }, done: true }),
  ]);

const systemMessage = (fake: ReturnType<typeof clientFor>['fake']) =>
  (
    JSON.parse(fake.requests[0].body!) as {
      messages: { role: string; content: string }[];
    }
  ).messages[0];

describe('extractClaim', () => {
  it('sends the passage and the kind, and returns the drained claim', async () => {
    const { fake, client } = clientFor(() =>
      scripted('Mr. Bennet visited Mr. Bingley first.'),
    );

    const result = await extractClaim(
      client,
      'llama3.1:8b',
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
      'who',
    );

    expect(result).toEqual({
      status: 'ok',
      claim: 'Mr. Bennet visited Mr. Bingley first.',
      raw: 'Mr. Bennet visited Mr. Bingley first.',
    });
    const message = systemMessage(fake);
    expect(message.role).toBe('system');
    expect(message.content).toContain(
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
    );
    expect(message.content).toContain('who did or said something');
    expect(message.content).toContain('NONE');
  });

  it('asks for two events when the kind is order', async () => {
    const { fake, client } = clientFor(() => scripted('A happened before B.'));

    await extractClaim(client, 'llama3.1:8b', 'passage', 'order');

    expect(systemMessage(fake).content).toContain('the order of two events');
  });

  it.each(['NONE', 'none.', 'None - the passage names no place.', ''])(
    'reads %j as no claim of that kind',
    async (reply) => {
      const { client } = clientFor(() => scripted(reply));

      const result = await extractClaim(
        client,
        'llama3.1:8b',
        'passage',
        'where',
      );

      expect(result).toEqual({ status: 'ok', raw: reply });
    },
  );
});
