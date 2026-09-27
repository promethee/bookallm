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

const systemContent = (fake: ReturnType<typeof clientFor>['fake']) =>
  (
    JSON.parse(fake.requests[0].body!) as {
      messages: { role: string; content: string }[];
    }
  ).messages[0].content;

const PASSAGE =
  'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.';
const TRUE_CLAIM = 'Mr. Bennet visited Mr. Bingley first.';
const CHANGED = 'Mr. Bennet visited Mr. Darcy first.';

describe('generateMutation', () => {
  it('sends the passage, the true claim and the kind, and returns the claim', async () => {
    const { fake, client } = clientFor(() => scripted(CHANGED));

    const result = await generateMutation(
      client,
      'llama3.1:8b',
      PASSAGE,
      TRUE_CLAIM,
      'who',
    );

    expect(result).toEqual({ status: 'ok', claim: CHANGED, raw: CHANGED });
    const content = systemContent(fake);
    expect(content).toContain(TRUE_CLAIM);
    expect(content).toContain(PASSAGE);
    expect(content).toContain('replace that person');
    expect(content).toContain('matters to what happens');
    expect(content).toContain('same language as the passage');
    expect(content).not.toContain('rejected');
  });

  it('lists the rejected versions with their reasons', async () => {
    const { fake, client } = clientFor(() => scripted(CHANGED));

    await generateMutation(client, 'llama3.1:8b', PASSAGE, TRUE_CLAIM, 'who', [
      { claim: 'Mr. Bennet visited Mr. Bingley second.', reason: 'still-true' },
      { claim: 'Someone went somewhere.', reason: 'changed-too-much' },
    ]);

    const content = systemContent(fake);
    expect(content).toContain(
      '- "Mr. Bennet visited Mr. Bingley second." (it is still true according to the passage)',
    );
    expect(content).toContain(
      '- "Someone went somewhere." (it changes more than that one detail)',
    );
  });

  it.each([
    ['a CLAIM: label', `CLAIM: ${CHANGED}`],
    ['an old-style kind line', `ATTRIBUTE: who\nCLAIM: ${CHANGED}`],
    ['a bare kind line', `WHO\n${CHANGED}`],
    ['quotes', `"${CHANGED}"`],
    ['an explanation after it', `${CHANGED}\n\nI changed Bingley to Darcy.`],
  ])('reads the claim from a reply with %s', async (_, reply) => {
    const { client } = clientFor(() => scripted(reply));

    const result = await generateMutation(
      client,
      'llama3.1:8b',
      PASSAGE,
      TRUE_CLAIM,
      'who',
    );

    expect(result).toMatchObject({ status: 'ok', claim: CHANGED });
  });

  it.each(['', 'ATTRIBUTE: age', 'WHERE'])(
    'reports %j as unreadable, with the reply',
    async (reply) => {
      const { client } = clientFor(() => scripted(reply));

      const result = await generateMutation(
        client,
        'llama3.1:8b',
        PASSAGE,
        TRUE_CLAIM,
        'where',
      );

      expect(result).toEqual({ status: 'unreadable', raw: reply });
    },
  );
});
