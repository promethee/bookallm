// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readArchive } from './archive';
import { parsePackage } from './package';
import { buildEpub, type BuildEpubOptions } from './testing/epub-builder';

const docs = [
  { href: 'ch1.xhtml', body: '<p>One</p>' },
  { href: 'text/ch2.xhtml', body: '<p>Two</p>' },
];

function parse(options: Partial<BuildEpubOptions> = {}) {
  const archive = readArchive(buildEpub({ documents: docs, ...options }));
  if (!archive.ok) throw new Error(`archive failed: ${archive.error.code}`);
  return parsePackage(archive.value);
}

describe('parsePackage metadata', () => {
  it('reads an EPUB 3 package', () => {
    const result = parse({
      title: 'Candide',
      authors: ['Voltaire'],
      language: 'fr',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Candide',
        authors: ['Voltaire'],
        language: 'fr',
        spine: ['OEBPS/ch1.xhtml', 'OEBPS/text/ch2.xhtml'],
        navPath: 'OEBPS/nav.xhtml',
        ncxPath: undefined,
      },
    });
  });

  it('reads an EPUB 2 package and finds its NCX', () => {
    const result = parse({ version: 2, title: 'Old Book' });

    expect(result.ok && result.value).toMatchObject({
      title: 'Old Book',
      navPath: undefined,
      ncxPath: 'OEBPS/toc.ncx',
    });
  });

  it('reports a missing title as an empty title, not an error', () => {
    const result = parse({ title: null });

    expect(result.ok && result.value.title).toBe('');
  });

  it('collects several authors', () => {
    const result = parse({ authors: ['A. One', 'B. Two'] });

    expect(result.ok && result.value.authors).toEqual(['A. One', 'B. Two']);
  });

  it('keeps the spine order, not the manifest order', () => {
    const result = parse({ spine: ['text/ch2.xhtml', 'ch1.xhtml'] });

    expect(result.ok && result.value.spine).toEqual([
      'OEBPS/text/ch2.xhtml',
      'OEBPS/ch1.xhtml',
    ]);
  });
});

describe('parsePackage structural errors', () => {
  it('fails as malformed when the package document is missing', () => {
    const result = parse({ files: { 'OEBPS/content.opf': null } });

    expect(result).toEqual({ ok: false, error: { code: 'malformed-epub' } });
  });

  it('fails as malformed when the container names no package', () => {
    const result = parse({
      files: {
        'META-INF/container.xml':
          '<container><rootfiles></rootfiles></container>',
      },
    });

    expect(result).toEqual({ ok: false, error: { code: 'malformed-epub' } });
  });

  it('fails as malformed when the reading order is empty', () => {
    const result = parse({ spine: [] });

    expect(result).toEqual({ ok: false, error: { code: 'malformed-epub' } });
  });

  it('fails as malformed when a spine document is missing from the archive', () => {
    const result = parse({ files: { 'OEBPS/text/ch2.xhtml': null } });

    expect(result).toEqual({ ok: false, error: { code: 'malformed-epub' } });
  });
});
