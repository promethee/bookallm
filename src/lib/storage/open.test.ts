// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { Book } from '../ingest/types';
import { openLibrary } from './library';
import { openStorage, storageProblem } from './open';
import type { StorageLike } from './settings';
import { nodeSqliteDatabase } from './testing/node-sqlite';

let counter = 0;
const nextName = () => `open-test-${(counter += 1)}`;

function fakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const book: Book = {
  hash: 'a'.repeat(64),
  title: 'Candide',
  authors: ['Voltaire'],
  language: 'fr',
  chapters: [{ number: 1, title: 'Un', text: 'Il était une fois.' }],
  chunks: [],
};

describe('openStorage: where the library lives', () => {
  it('keeps the library in the SQLite database in the desktop app', async () => {
    const db = nodeSqliteDatabase();
    const storage = await openStorage({
      getStorage: fakeStorage,
      isTauri: true,
      openSqlDatabase: async () => db,
      requestPersistence: async () => true,
    });

    await storage.library.saveBook(book);

    expect(await db.select<{ hash: string }>('SELECT hash FROM books')).toEqual(
      [{ hash: book.hash }],
    );
  });

  it('keeps the library in IndexedDB in the browser build', async () => {
    const openSqlDatabase = vi.fn(async () => nodeSqliteDatabase());
    const storage = await openStorage({
      getStorage: fakeStorage,
      isTauri: false,
      openSqlDatabase,
      requestPersistence: async () => true,
    });

    await storage.library.saveBook(book);

    expect(openSqlDatabase).not.toHaveBeenCalled();
    expect(
      (await (await openLibrary()).registry.list()).map((entry) => entry.hash),
    ).toContain(book.hash);
  });

  it('falls back to memory when the desktop database cannot be opened', async () => {
    const storage = await openStorage({
      getStorage: fakeStorage,
      isTauri: true,
      openSqlDatabase: () => Promise.reject(new Error('no database')),
      requestPersistence: async () => true,
    });

    expect(storage.booksProblem).toBe('unavailable');
  });
});

describe('openStorage', () => {
  it('opens settings and books that are remembered across restarts, with no problem', async () => {
    const storage = fakeStorage();
    const name = nextName();
    const options = {
      getStorage: () => storage,
      openLibrary: () => openLibrary({ name }),
      requestPersistence: async () => true,
    };

    const first = await openStorage(options);
    first.settings.save({ language: 'fr' });
    await first.library.saveBook(book);
    first.library.close();
    const second = await openStorage(options);

    expect(storageProblem(first)).toBeUndefined();
    expect(second.settings.load().language).toBe('fr');
    expect(
      (await second.library.registry.list()).map((entry) => entry.hash),
    ).toEqual([book.hash]);
  });

  it('falls back to memory and reports "unavailable" when nothing can be stored', async () => {
    const storage = await openStorage({
      getStorage: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      openLibrary: () => Promise.reject(new Error('IndexedDB is blocked')),
      requestPersistence: async () => true,
    });

    expect(storage.booksProblem).toBe('unavailable');
    expect(storage.settings.problem()).toBe('unavailable');
    expect(storageProblem(storage)).toBe('unavailable');

    // The app still works for this session.
    storage.settings.save({ language: 'fr' });
    await storage.library.saveBook(book);
    expect(storage.settings.load().language).toBe('fr');
    expect(await storage.library.getBook(book.hash)).toEqual(book);
  });

  it('reports only the books problem when settings work but books cannot be opened', async () => {
    const storage = await openStorage({
      getStorage: fakeStorage,
      openLibrary: () => Promise.reject(new Error('blocked')),
      requestPersistence: async () => true,
    });

    expect(storage.settings.problem()).toBeUndefined();
    expect(storageProblem(storage)).toBe('unavailable');
  });

  it('reports a full settings store', async () => {
    const storage = await openStorage({
      getStorage: () => ({
        getItem: () => null,
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
      }),
      openLibrary: () => openLibrary({ name: nextName() }),
      requestPersistence: async () => true,
    });

    storage.settings.save({ language: 'fr' });

    expect(storageProblem(storage)).toBe('full');
  });

  it('asks the browser for persistent storage once', async () => {
    const requestPersistence = vi.fn(async () => true);

    await openStorage({
      getStorage: fakeStorage,
      openLibrary: () => openLibrary({ name: nextName() }),
      requestPersistence,
    });

    expect(requestPersistence).toHaveBeenCalledTimes(1);
  });

  it('carries on when the persistence request fails', async () => {
    const storage = await openStorage({
      getStorage: fakeStorage,
      openLibrary: () => openLibrary({ name: nextName() }),
      requestPersistence: () => Promise.reject(new Error('not allowed')),
    });

    expect(storageProblem(storage)).toBeUndefined();
  });

  it('works when the browser has no persistence support', async () => {
    const storage = await openStorage({
      getStorage: fakeStorage,
      openLibrary: () => openLibrary({ name: nextName() }),
    });

    expect(storage.library).toBeDefined();
  });
});
