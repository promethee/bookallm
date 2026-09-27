// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOllamaClient } from '../ollama';
import {
  createFakeFetch,
  ndjson,
  streamResponse,
  type FakeHandler,
} from '../ollama/testing/fake-fetch';
import { generateMutation } from './mutate';

const clientFor = (handler: FakeHandler) => {
  const fake = createFakeFetch({ 'POST /api/chat': handler });
  return { fake, client: createOllamaClient({ fetch: fake.fetch }) };
};

const scripted = (content: string) =>
  streamResponse([
    ndjson({ message: { role: 'assistant', content }, done: false }),
    ndjson({ message: { role: 'assistant', content: '' }, done: true }),
  ]);

describe('generateMutation', () => {
  it('sends the true claim and passage, and parses the labelled response', async () => {
    const { fake, client } = clientFor(() =>
      scripted('ATTRIBUTE: where\nCLAIM: Mr. Bennet visited Mr. Darcy first.'),
    );

    const result = await generateMutation(
      client,
      'llama3.1:8b',
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
      'Mr. Bennet visited Mr. Bingley first.',
    );

    expect(result).toEqual({
      status: 'ok',
      claim: 'Mr. Bennet visited Mr. Darcy first.',
      attribute: 'where',
      raw: 'ATTRIBUTE: where\nCLAIM: Mr. Bennet visited Mr. Darcy first.',
    });
    const { messages } = JSON.parse(fake.requests[0].body!) as {
      messages: { role: string; content: string }[];
    };
    expect(messages[0].content).toContain(
      'Mr. Bennet visited Mr. Bingley first.',
    );
    expect(messages[0].content).toContain(
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
    );
  });

  it('tolerates a bare attribute line with no ATTRIBUTE:/CLAIM: labels', async () => {
    const { client } = clientFor(() =>
      scripted('ORDER\nThe elopement of Wickham and Lydia happened first.'),
    );

    const result = await generateMutation(
      client,
      'llama3.1:8b',
      'passage',
      'true claim',
    );

    expect(result).toEqual({
      status: 'ok',
      claim: 'The elopement of Wickham and Lydia happened first.',
      attribute: 'order',
      raw: 'ORDER\nThe elopement of Wickham and Lydia happened first.',
    });
  });

  it('reports unreadable, with the reply, when the response cannot be parsed', async () => {
    const { client } = clientFor(() => scripted('Something unrelated.'));

    const result = await generateMutation(
      client,
      'llama3.1:8b',
      'passage',
      'true claim',
    );

    expect(result).toEqual({
      status: 'unreadable',
      raw: 'Something unrelated.',
    });
  });
});
