import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { toRegistryEntry } from '../ingest/classify';
import { DuplicateHashError, matchesTitleOrFilename } from '../ingest/registry';
import type { Book, Registry, RegistryEntry } from '../ingest/types';

/** Thrown when a save fails because the device has no room left. */
export class StorageFullError extends Error {
  constructor() {
    super('There is no room left to save the book');
    this.name = 'StorageFullError';
  }
}

/** Imported books: the registry of what exists, plus each book's text and chunks. */
export interface BookLibrary {
  readonly registry: Registry;
  /**
   * Saves a book and its registry entry in one all-or-nothing step, so neither can
   * exist without the other. Rejects with `DuplicateHashError` or `StorageFullError`.
   */
  saveBook(book: Book): Promise<void>;
  getBook(hash: string): Promise<Book | undefined>;
  close(): void;
}

interface RegistryRecord {
  /** Insertion order, so `list()` is stable. */
  seq: number;
  entry: RegistryEntry;
}

interface LibrarySchema extends DBSchema {
  books: { key: string; value: Book };
  registry: { key: string; value: RegistryRecord; indexes: { seq: number } };
}

type LibraryDb = IDBPDatabase<LibrarySchema>;

const DEFAULT_NAME = 'bookallm';

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.code === 22);

const isConstraintError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'ConstraintError';

const lastSeq = async (store: {
  index(name: 'seq'): {
    openCursor(range: null, direction: 'prev'): Promise<{ key: number } | null>;
  };
}): Promise<number> =>
  (await store.index('seq').openCursor(null, 'prev'))?.key ?? 0;

class IndexedDbRegistry implements Registry {
  constructor(private readonly db: LibraryDb) {}

  async get(hash: string): Promise<RegistryEntry | undefined> {
    return (await this.db.get('registry', hash))?.entry;
  }

  async findByTitleOrFilename(
    title: string,
    filename?: string,
  ): Promise<RegistryEntry[]> {
    const records = await this.db.getAllFromIndex('registry', 'seq');
    return records
      .map((record) => record.entry)
      .filter((entry) => matchesTitleOrFilename(entry, title, filename));
  }

  async add(entry: RegistryEntry): Promise<void> {
    const tx = this.db.transaction('registry', 'readwrite');
    const store = tx.objectStore('registry');
    if (await store.get(entry.hash)) {
      await tx.done;
      throw new DuplicateHashError(entry.hash);
    }
    try {
      await store.add({ seq: (await lastSeq(store)) + 1, entry });
      await tx.done;
    } catch (error) {
      await tx.done.catch(() => undefined);
      throw isConstraintError(error)
        ? new DuplicateHashError(entry.hash)
        : error;
    }
  }

  async list(): Promise<RegistryEntry[]> {
    return (await this.db.getAllFromIndex('registry', 'seq')).map(
      (record) => record.entry,
    );
  }

  /** Removes the record and the stored content together. The user's EPUB is never touched. */
  async remove(hash: string): Promise<boolean> {
    const tx = this.db.transaction(['registry', 'books'], 'readwrite');
    const existed = (await tx.objectStore('registry').get(hash)) !== undefined;
    await tx.objectStore('registry').delete(hash);
    await tx.objectStore('books').delete(hash);
    await tx.done;
    return existed;
  }
}

class IndexedDbLibrary implements BookLibrary {
  readonly registry: Registry;

  constructor(private readonly db: LibraryDb) {
    this.registry = new IndexedDbRegistry(db);
  }

  async saveBook(book: Book): Promise<void> {
    const tx = this.db.transaction(['registry', 'books'], 'readwrite');
    try {
      const registry = tx.objectStore('registry');
      if (await registry.get(book.hash))
        throw new DuplicateHashError(book.hash);
      await registry.add({
        seq: (await lastSeq(registry)) + 1,
        entry: toRegistryEntry(book),
      });
      // Written second on purpose: if this fails, the entry above is rolled back too.
      await tx.objectStore('books').put(book);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction had already finished or aborted itself.
      }
      await tx.done.catch(() => undefined);
      if (isQuotaError(error)) throw new StorageFullError();
      if (isConstraintError(error)) throw new DuplicateHashError(book.hash);
      throw error;
    }
  }

  getBook(hash: string): Promise<Book | undefined> {
    return this.db.get('books', hash);
  }

  close(): void {
    this.db.close();
  }
}

/** Opens (creating if needed) the on-device library in the browser's IndexedDB. */
export async function openLibrary(
  options: { name?: string } = {},
): Promise<BookLibrary> {
  const db = await openDB<LibrarySchema>(options.name ?? DEFAULT_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'hash' });
      const registry = database.createObjectStore('registry', {
        keyPath: 'entry.hash',
      });
      registry.createIndex('seq', 'seq', { unique: true });
    },
  });
  return new IndexedDbLibrary(db);
}
