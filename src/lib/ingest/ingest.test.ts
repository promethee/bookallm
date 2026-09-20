// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  InMemoryRegistry,
  hashBytes,
  ingestEpub,
  toRegistryEntry,
  type Book,
  type IngestResult,
} from './index';
import {
  AES_ALGORITHM,
  buildEpub,
  encryptionXml,
  type BuildEpubOptions,
} from './testing/epub-builder';
import { makeEntry } from './testing/registry-contract';

const sample = (overrides: Partial<BuildEpubOptions> = {}): Uint8Array =>
  buildEpub({
    title: 'Candide',
    authors: ['Voltaire'],
    language: 'fr',
    documents: [
      { href: 'a.xhtml', body: '<h1>Premier</h1><p>Il était une fois.</p>' },
      { href: 'b.xhtml', body: '<h1>Second</h1><p>La suite.</p>' },
    ],
    toc: [
      { title: 'Chapitre 1', href: 'a.xhtml' },
      { title: 'Chapitre 2', href: 'b.xhtml' },
    ],
    ...overrides,
  });

function bookOf(result: IngestResult): Book {
  if (result.status !== 'new' && result.status !== 'possible-duplicate') {
    throw new Error(`expected a book, got ${result.status}`);
  }
  return result.book;
}

describe('ingestEpub outcomes', () => {
  it('returns a new book with metadata, chapters and chunks', async () => {
    const bytes = sample();
    const registry = new InMemoryRegistry();

    const result = await ingestEpub(bytes, {
      registry,
      filename: 'candide.epub',
    });

    expect(result.status).toBe('new');
    const book = bookOf(result);
    expect(book).toMatchObject({
      hash: await hashBytes(bytes),
      title: 'Candide',
      authors: ['Voltaire'],
      language: 'fr',
      sourceFilename: 'candide.epub',
    });
    expect(book.chapters.map((c) => c.title)).toEqual([
      'Chapitre 1',
      'Chapitre 2',
    ]);
    expect(book.chunks.length).toBeGreaterThan(0);
    for (const chunk of book.chunks) {
      const chapter = book.chapters[chunk.locator.chapterNumber - 1];
      expect(
        chapter.text.slice(chunk.locator.charStart, chunk.locator.charEnd),
      ).toBe(chunk.text);
    }
  });

  it('does not write to the registry; adding the book is the caller’s choice', async () => {
    const registry = new InMemoryRegistry();

    await ingestEpub(sample(), { registry });

    expect(await registry.list()).toEqual([]);
  });

  it('returns an existing book without parsing it again', async () => {
    // These bytes are not an EPUB, so any attempt to parse them would fail.
    const bytes = new TextEncoder().encode('not an epub at all');
    const entry = makeEntry({ hash: await hashBytes(bytes) });
    const registry = new InMemoryRegistry();
    await registry.add(entry);

    const result = await ingestEpub(bytes, { registry });

    expect(result).toEqual({ status: 'existing', entry });
  });

  it('recognises a book that was ingested and registered earlier', async () => {
    const bytes = sample();
    const registry = new InMemoryRegistry();
    const first = await ingestEpub(bytes, { registry });
    await registry.add(toRegistryEntry(bookOf(first)));

    const second = await ingestEpub(bytes, { registry });

    expect(second.status).toBe('existing');
    expect(second).not.toHaveProperty('book');
  });

  it('flags a different file with the same title as a possible duplicate', async () => {
    const registry = new InMemoryRegistry();
    const first = await ingestEpub(sample(), { registry });
    const firstEntry = toRegistryEntry(bookOf(first));
    await registry.add(firstEntry);

    const other = sample({
      documents: [{ href: 'a.xhtml', body: '<p>A different edition.</p>' }],
      toc: [{ title: 'Only', href: 'a.xhtml' }],
    });
    const result = await ingestEpub(other, { registry });

    expect(result.status).toBe('possible-duplicate');
    if (result.status !== 'possible-duplicate') return;
    expect(result.candidates).toEqual([firstEntry]);
    expect(result.book.chunks.length).toBeGreaterThan(0);
    expect(await registry.list()).toEqual([firstEntry]);
  });

  it('applies chunking options', async () => {
    const registry = new InMemoryRegistry();
    const long = sample({
      documents: [
        { href: 'a.xhtml', body: `<p>${'word '.repeat(400).trim()}.</p>` },
      ],
      toc: [{ title: 'Only', href: 'a.xhtml' }],
    });

    const result = await ingestEpub(long, {
      registry,
      chunking: { targetSize: 100, maxSize: 200 },
    });

    const book = bookOf(result);
    expect(book.chunks.length).toBeGreaterThan(5);
    expect(
      Math.max(...book.chunks.map((c) => c.text.length)),
    ).toBeLessThanOrEqual(200);
  });
});

describe('ingestEpub errors', () => {
  const run = (bytes: Uint8Array) =>
    ingestEpub(bytes, { registry: new InMemoryRegistry() });

  it('reports input that is not an EPUB', async () => {
    expect(await run(new TextEncoder().encode('hello'))).toEqual({
      status: 'error',
      error: { code: 'not-an-epub' },
    });
  });

  it('reports an EPUB with broken structure', async () => {
    const bytes = sample({ files: { 'OEBPS/content.opf': null } });

    expect(await run(bytes)).toEqual({
      status: 'error',
      error: { code: 'malformed-epub' },
    });
  });

  it('reports an EPUB without extractable text', async () => {
    const bytes = sample({
      documents: [
        { href: 'a.xhtml', body: '<div><img src="p.jpg" alt=""/></div>' },
      ],
      toc: [{ title: 'Plate', href: 'a.xhtml' }],
    });

    expect(await run(bytes)).toEqual({
      status: 'error',
      error: { code: 'no-text-content' },
    });
  });

  it('reports a DRM-locked EPUB and names the scheme', async () => {
    const bytes = sample({ files: { 'META-INF/rights.xml': '<rights/>' } });

    expect(await run(bytes)).toEqual({
      status: 'error',
      error: { code: 'drm-locked', scheme: 'adobe' },
    });
  });

  it('produces no chapters, chunks or registry entry for a DRM-locked EPUB', async () => {
    const registry = new InMemoryRegistry();
    const bytes = sample({
      files: { 'META-INF/encryption.xml': encryptionXml([AES_ALGORITHM]) },
    });

    const result = await ingestEpub(bytes, { registry });

    expect(result.status).toBe('error');
    expect(result).not.toHaveProperty('book');
    expect(await registry.list()).toEqual([]);
  });
});

describe('ingestEpub determinism', () => {
  it('produces identical books for the same bytes', async () => {
    const bytes = sample();

    const first = await ingestEpub(bytes, { registry: new InMemoryRegistry() });
    const second = await ingestEpub(bytes, {
      registry: new InMemoryRegistry(),
    });

    expect(bookOf(first)).toEqual(bookOf(second));
  });
});
