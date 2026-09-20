// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { InMemoryRegistry, ingestEpub } from './index';
import { buildEpub } from './testing/epub-builder';

vi.mock('./chapters', () => ({
  assembleChapters: () => {
    throw new Error('boom');
  },
}));

describe('ingestEpub with an unexpected parsing failure', () => {
  it('maps it to malformed-epub instead of throwing', async () => {
    const bytes = buildEpub({
      documents: [{ href: 'a.xhtml', body: '<p>Text.</p>' }],
    });

    const result = await ingestEpub(bytes, {
      registry: new InMemoryRegistry(),
    });

    expect(result).toEqual({
      status: 'error',
      error: { code: 'malformed-epub' },
    });
  });
});
