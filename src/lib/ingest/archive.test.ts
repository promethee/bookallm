// @vitest-environment node
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readArchive } from './archive';
import { buildEpub } from './testing/epub-builder';

const docs = [{ href: 'ch1.xhtml', body: '<p>One</p>' }];

describe('readArchive', () => {
  it('reads the text entries of a valid archive', () => {
    const result = readArchive(buildEpub({ documents: docs }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value)).toContain('META-INF/container.xml');
    expect(Object.keys(result.value)).toContain('OEBPS/ch1.xhtml');
  });

  it('skips binary entries such as images and fonts', () => {
    const bytes = buildEpub({
      documents: docs,
      files: { 'OEBPS/cover.png': new Uint8Array([1, 2, 3]) },
    });

    const result = readArchive(bytes);

    expect(result.ok && result.value['OEBPS/cover.png']).toBeFalsy();
  });

  it('rejects input that is not a zip archive', () => {
    const result = readArchive(strToU8('this is plainly not a zip file'));

    expect(result).toEqual({ ok: false, error: { code: 'not-an-epub' } });
  });

  it('rejects an empty input', () => {
    const result = readArchive(new Uint8Array());

    expect(result).toEqual({ ok: false, error: { code: 'not-an-epub' } });
  });

  it('rejects a zip archive without the EPUB container description', () => {
    const bytes = zipSync({ 'notes.txt': strToU8('hello') });

    expect(readArchive(bytes)).toEqual({
      ok: false,
      error: { code: 'not-an-epub' },
    });
  });

  it('rejects an archive whose text exceeds the size cap as malformed', () => {
    const result = readArchive(buildEpub({ documents: docs }), {
      maxTotalSize: 50,
    });

    expect(result).toEqual({ ok: false, error: { code: 'malformed-epub' } });
  });
});
