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
  it.each([
    'FALSE',
    'False.',
    'Answer: FALSE',
    'false - the passage says Venice',
  ])('confirms %j', async (reply) => {
    const { client } = clientFor(() => scripted(reply));

    expect(
      await verifyContradiction(client, 'llama3.1:8b', 'passage', 'claim'),
    ).toEqual({ status: 'ok', confirmed: true, raw: reply });
  });

  it.each([
    'TRUE',
    'MATCHES',
    'CONTRADICTS',
    'It is not false.',
    'Not FALSE',
    'The claim does not contradict the passage.',
    'I am not sure about this one.',
    '',
  ])('does not confirm %j', async (reply) => {
    const { client } = clientFor(() => scripted(reply));

    expect(
      await verifyContradiction(client, 'llama3.1:8b', 'passage', 'claim'),
    ).toEqual({ status: 'ok', confirmed: false, raw: reply });
  });

  it('sends the passage and the claim, asking for TRUE or FALSE', async () => {
    const { fake, client } = clientFor(() => scripted('FALSE'));

    await verifyContradiction(
      client,
      'llama3.1:8b',
      'the passage',
      'the claim',
    );

    const { messages } = JSON.parse(fake.requests[0].body!) as {
      messages: { role: string; content: string }[];
    };
    expect(messages[0].content).toContain('the passage');
    expect(messages[0].content).toContain('the claim');
    expect(messages[0].content).toContain('TRUE or FALSE');
  });
});
