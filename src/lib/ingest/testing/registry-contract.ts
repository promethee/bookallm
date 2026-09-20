import { describe, expect, it } from 'vitest';
import { DuplicateHashError } from '../registry';
import type { Registry, RegistryEntry } from '../types';

export function makeEntry(
  overrides: Partial<RegistryEntry> = {},
): RegistryEntry {
  return {
    hash: 'a'.repeat(64),
    title: 'Candide',
    authors: ['Voltaire'],
    language: 'fr',
    sourceFilename: 'candide.epub',
    chapterCount: 30,
    chunkCount: 120,
    importedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Behavior every registry implementation must have. Run it against each new
 * implementation (e.g. `runRegistryContract('file registry', () => new FileRegistry(...))`).
 */
export function runRegistryContract(
  name: string,
  create: () => Registry | Promise<Registry>,
): void {
  describe(`${name} registry contract`, () => {
    it('adds an entry and finds it by hash, title and filename, and lists it', async () => {
      const registry = await create();
      const entry = makeEntry();

      await registry.add(entry);

      expect(await registry.get(entry.hash)).toEqual(entry);
      expect(await registry.findByTitleOrFilename('Candide')).toEqual([entry]);
      expect(
        await registry.findByTitleOrFilename('Other', 'candide.epub'),
      ).toEqual([entry]);
      expect(await registry.list()).toEqual([entry]);
    });

    it('returns undefined for an unknown hash', async () => {
      const registry = await create();

      expect(await registry.get('f'.repeat(64))).toBeUndefined();
    });

    it('rejects a second entry with the same hash and leaves the first unchanged', async () => {
      const registry = await create();
      const original = makeEntry();
      await registry.add(original);

      await expect(
        registry.add(makeEntry({ title: 'Different title' })),
      ).rejects.toBeInstanceOf(DuplicateHashError);

      expect(await registry.get(original.hash)).toEqual(original);
      expect(await registry.list()).toEqual([original]);
    });

    it('keeps entries with different hashes as separate books, even with the same title', async () => {
      const registry = await create();
      const first = makeEntry({ hash: '1'.repeat(64) });
      const second = makeEntry({ hash: '2'.repeat(64) });

      await registry.add(first);
      await registry.add(second);

      expect(await registry.list()).toEqual([first, second]);
      expect(await registry.findByTitleOrFilename('Candide')).toEqual([
        first,
        second,
      ]);
    });

    it('matches titles and filenames ignoring case and extra whitespace', async () => {
      const registry = await create();
      const entry = makeEntry({
        title: 'Le  Petit Prince',
        sourceFilename: 'Petit Prince.epub',
      });
      await registry.add(entry);

      expect(
        await registry.findByTitleOrFilename('  le petit   PRINCE '),
      ).toEqual([entry]);
      expect(
        await registry.findByTitleOrFilename('x', 'PETIT   prince.EPUB'),
      ).toEqual([entry]);
    });

    it('does not match an empty title or filename', async () => {
      const registry = await create();
      await registry.add(makeEntry({ title: '', sourceFilename: undefined }));

      expect(await registry.findByTitleOrFilename('', undefined)).toEqual([]);
      expect(await registry.findByTitleOrFilename('   ', '')).toEqual([]);
    });

    it('does not let callers alter stored entries through returned values', async () => {
      const registry = await create();
      const entry = makeEntry();
      await registry.add(entry);

      const [found] = await registry.list();
      found.title = 'Tampered';
      entry.title = 'Also tampered';

      expect((await registry.get(entry.hash))?.title).toBe('Candide');
    });

    it('removes an entry so it can no longer be found or listed', async () => {
      const registry = await create();
      const entry = makeEntry();
      await registry.add(entry);

      expect(await registry.remove(entry.hash)).toBe(true);

      expect(await registry.get(entry.hash)).toBeUndefined();
      expect(
        await registry.findByTitleOrFilename('Candide', 'candide.epub'),
      ).toEqual([]);
      expect(await registry.list()).toEqual([]);
    });

    it('reports false when removing an unknown hash', async () => {
      const registry = await create();

      expect(await registry.remove('f'.repeat(64))).toBe(false);
    });
  });
}
