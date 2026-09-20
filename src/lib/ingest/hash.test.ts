// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashBytes } from './hash';
import { buildEpub } from './testing/epub-builder';

describe('hashBytes', () => {
  it('matches the known SHA-256 of a short input', async () => {
    const hash = await hashBytes(new TextEncoder().encode('abc'));

    expect(hash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('gives the same hash for identical bytes', async () => {
    const docs = [{ href: 'a.xhtml', body: '<p>Same</p>' }];

    const first = await hashBytes(buildEpub({ documents: docs }));
    const second = await hashBytes(buildEpub({ documents: docs }));

    expect(first).toBe(second);
  });

  it('gives a different hash when one byte differs', async () => {
    const bytes = buildEpub({
      documents: [{ href: 'a.xhtml', body: '<p>Same</p>' }],
    });
    const changed = bytes.slice();
    changed[changed.length - 1] ^= 1;

    expect(await hashBytes(bytes)).not.toBe(await hashBytes(changed));
  });

  it('returns 64 lowercase hex characters', async () => {
    expect(await hashBytes(new Uint8Array([1, 2, 3]))).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});
