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

describe('extractClaim', () => {
  it('sends the passage text and returns the drained claim', async () => {
    const { fake, client } = clientFor(() =>
      scripted('Mr. Bennet visited Mr. Bingley first.'),
    );

    const result = await extractClaim(
      client,
      'llama3.1:8b',
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
    );

    expect(result).toEqual({
      status: 'ok',
      text: 'Mr. Bennet visited Mr. Bingley first.',
    });
    const { messages } = JSON.parse(fake.requests[0].body!) as {
      messages: { role: string; content: string }[];
    };
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
    );
  });
});
