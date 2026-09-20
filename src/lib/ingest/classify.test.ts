// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyImport, toRegistryEntry } from './classify';
import { InMemoryRegistry } from './registry';
import { makeEntry } from './testing/registry-contract';
import type { Book } from './types';

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'b'.repeat(64),
  title: 'Candide',
  authors: ['Voltaire'],
  language: 'fr',
  sourceFilename: 'candide-2.epub',
  chapters: [{ number: 1, title: 'One', text: 'Text.' }],
  chunks: [],
  ...overrides,
});

async function registryWith(...entries: ReturnType<typeof makeEntry>[]) {
  const registry = new InMemoryRegistry();
  for (const entry of entries) await registry.add(entry);
  return registry;
}

describe('classifyImport', () => {
  it('flags the same title in different letter case as a possible duplicate', async () => {
    const existing = makeEntry({ title: 'candide' });
    const registry = await registryWith(existing);

    const result = await classifyImport(
      registry,
      makeBook({ title: 'CANDIDE' }),
    );

    expect(result).toEqual({
      status: 'possible-duplicate',
      candidates: [existing],
    });
  });

  it('flags the same filename with a different title', async () => {
    const existing = makeEntry({
      title: 'Something else',
      sourceFilename: 'book.epub',
    });
    const registry = await registryWith(existing);

    const result = await classifyImport(
      registry,
      makeBook({ title: 'Unrelated', sourceFilename: 'Book.EPUB' }),
    );

    expect(result).toEqual({
      status: 'possible-duplicate',
      candidates: [existing],
    });
  });

  it('classifies a book that matches nothing as new', async () => {
    const registry = await registryWith(
      makeEntry({ title: 'Emma', sourceFilename: 'emma.epub' }),
    );

    const result = await classifyImport(registry, makeBook());

    expect(result).toEqual({ status: 'new' });
  });

  it('classifies an untitled book with no filename as new', async () => {
    const registry = await registryWith(
      makeEntry({ title: '', sourceFilename: undefined }),
    );

    const result = await classifyImport(
      registry,
      makeBook({ title: '', sourceFilename: undefined }),
    );

    expect(result).toEqual({ status: 'new' });
  });

  it('lists every matching entry', async () => {
    const first = makeEntry({ hash: '1'.repeat(64) });
    const second = makeEntry({ hash: '2'.repeat(64) });
    const registry = await registryWith(first, second);

    const result = await classifyImport(registry, makeBook());

    expect(result).toEqual({
      status: 'possible-duplicate',
      candidates: [first, second],
    });
  });

  it('never modifies existing entries', async () => {
    const existing = makeEntry();
    const registry = await registryWith(existing);
    const before = await registry.list();

    await classifyImport(registry, makeBook());

    expect(await registry.list()).toEqual(before);
    expect(before).toEqual([existing]);
  });

  it('keeps both books as separate entries once the new one is registered', async () => {
    const existing = makeEntry();
    const registry = await registryWith(existing);
    const book = makeBook();

    const result = await classifyImport(registry, book);
    expect(result.status).toBe('possible-duplicate');
    await registry.add(toRegistryEntry(book, '2026-02-02T00:00:00.000Z'));

    const entries = await registry.list();
    expect(entries.map((e) => e.hash)).toEqual([existing.hash, book.hash]);
    expect(entries[0]).toEqual(existing);
  });
});

describe('toRegistryEntry', () => {
  it('summarises a book', () => {
    const book = makeBook({
      chunks: [
        {
          id: 'x:1:0',
          text: 'Text.',
          locator: {
            chapterNumber: 1,
            chapterTitle: 'One',
            paragraphStart: 0,
            paragraphEnd: 0,
            charStart: 0,
            charEnd: 5,
          },
        },
      ],
    });

    expect(toRegistryEntry(book, '2026-02-02T00:00:00.000Z')).toEqual({
      hash: book.hash,
      title: 'Candide',
      authors: ['Voltaire'],
      language: 'fr',
      sourceFilename: 'candide-2.epub',
      chapterCount: 1,
      chunkCount: 1,
      importedAt: '2026-02-02T00:00:00.000Z',
    });
  });
});
