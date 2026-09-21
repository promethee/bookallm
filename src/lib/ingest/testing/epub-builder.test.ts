// @vitest-environment node
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { buildEpub } from './epub-builder';

const docs = [
  { href: 'ch1.xhtml', body: '<p>One</p>' },
  { href: 'ch2.xhtml', body: '<p>Two</p>' },
];

describe('buildEpub', () => {
  it('gives identical bytes for identical input, whatever the time', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const first = buildEpub({ documents: docs });
      vi.setSystemTime(new Date('2026-01-01T00:00:07Z'));
      const second = buildEpub({ documents: docs });

      expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds an EPUB 3 archive with a navigation document', () => {
    const files = unzipSync(
      buildEpub({
        documents: docs,
        toc: [{ title: 'One', href: 'ch1.xhtml' }],
      }),
    );

    expect(Object.keys(files)).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/ch1.xhtml',
      'OEBPS/ch2.xhtml',
    ]);
    expect(strFromU8(files['mimetype'])).toBe('application/epub+zip');
    expect(strFromU8(files['OEBPS/nav.xhtml'])).toContain('epub:type="toc"');
  });

  it('builds an EPUB 2 archive with an NCX', () => {
    const files = unzipSync(
      buildEpub({
        version: 2,
        documents: docs,
        toc: [{ title: 'One', href: 'ch1.xhtml' }],
      }),
    );

    expect(files['OEBPS/toc.ncx']).toBeDefined();
    expect(files['OEBPS/nav.xhtml']).toBeUndefined();
    expect(strFromU8(files['OEBPS/content.opf'])).toContain('version="2.0"');
  });

  it('omits the navigation file when toc is null', () => {
    const files = unzipSync(buildEpub({ documents: docs, toc: null }));

    expect(files['OEBPS/nav.xhtml']).toBeUndefined();
  });

  it('adds extra files and removes generated ones', () => {
    const files = unzipSync(
      buildEpub({
        documents: docs,
        files: {
          'META-INF/rights.xml': '<rights/>',
          'META-INF/container.xml': null,
        },
      }),
    );

    expect(strFromU8(files['META-INF/rights.xml'])).toBe('<rights/>');
    expect(files['META-INF/container.xml']).toBeUndefined();
  });

  it('omits the title from metadata when title is null', () => {
    const files = unzipSync(buildEpub({ documents: docs, title: null }));

    expect(strFromU8(files['OEBPS/content.opf'])).not.toContain('<dc:title>');
  });
});
