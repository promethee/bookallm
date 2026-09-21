import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { toRegistryEntry } from '../ingest/classify';
import { DuplicateHashError, matchesTitleOrFilename } from '../ingest/registry';
import type { Book, Registry, RegistryEntry } from '../ingest/types';
import type {
  ChapterVectors,
  SavedChapter,
  VectorStore,
} from '../indexing/types';
import { StorageFullError } from './errors';
import { assertChapterVectors } from './vectors';

export { StorageFullError };

/** Imported books: the registry of what exists, each book's text and chunks, and its vectors. */
export interface BookLibrary {
  readonly registry: Registry;
  readonly vectors: VectorStore;
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

/** A chapter's vectors, keyed by book, model and chapter so one book's records sit together. */
type VectorKey = [hash: string, model: string, chapter: number];

interface LibrarySchema extends DBSchema {
  books: { key: string; value: Book };
  registry: { key: string; value: RegistryRecord; indexes: { seq: number } };
  vectors: { key: VectorKey; value: ChapterVectors };
}

type LibraryDb = IDBPDatabase<LibrarySchema>;

const DEFAULT_NAME = 'bookallm';
/** Version 2 added the `vectors` store. */
const DB_VERSION = 2;

/** Every key of one book: an array key sorts after a string, so `[hash, []]` ends the range. */
const bookRange = (hash: string): IDBKeyRange =>
  IDBKeyRange.bound([hash], [hash, []]);
const modelRange = (hash: string, model: string): IDBKeyRange =>
  IDBKeyRange.bound([hash, model], [hash, model, Infinity]);

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
    const tx = this.db.transaction(
      ['registry', 'books', 'vectors'],
      'readwrite',
    );
    const existed = (await tx.objectStore('registry').get(hash)) !== undefined;
    await tx.objectStore('registry').delete(hash);
    await tx.objectStore('books').delete(hash);
    await tx.objectStore('vectors').delete(bookRange(hash));
    await tx.done;
    return existed;
  }
}

class IndexedDbVectors implements VectorStore {
  constructor(private readonly db: LibraryDb) {}

  async savedChapters(hash: string, model: string): Promise<SavedChapter[]> {
    const records = await this.db.getAll('vectors', modelRange(hash, model));
    return records.map(({ chapter, dimension }) => ({ chapter, dimension }));
  }

  loadChapter(
    hash: string,
    model: string,
    chapter: number,
  ): Promise<ChapterVectors | undefined> {
    return this.db.get('vectors', [hash, model, chapter]);
  }

  async saveChapter(record: ChapterVectors): Promise<void> {
    assertChapterVectors(record);
    const tx = this.db.transaction('vectors', 'readwrite');
    try {
      await tx.objectStore('vectors').put(record);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction had already finished or aborted itself.
      }
      await tx.done.catch(() => undefined);
      throw isQuotaError(error) ? new StorageFullError() : error;
    }
  }

  async discard(hash: string, model: string): Promise<void> {
    await this.db.delete('vectors', modelRange(hash, model));
  }

  async discardOtherModels(hash: string, keepModel: string): Promise<void> {
    const tx = this.db.transaction('vectors', 'readwrite');
    const store = tx.objectStore('vectors');
    for (const key of await store.getAllKeys(bookRange(hash)))
      if (key[1] !== keepModel) await store.delete(key);
    await tx.done;
  }

  async modelsWithVectors(hash: string): Promise<string[]> {
    const keys = await this.db.getAllKeys('vectors', bookRange(hash));
    return [...new Set(keys.map((key) => key[1]))];
  }
}

class IndexedDbLibrary implements BookLibrary {
  readonly registry: Registry;
  readonly vectors: VectorStore;

  constructor(private readonly db: LibraryDb) {
    this.registry = new IndexedDbRegistry(db);
    this.vectors = new IndexedDbVectors(db);
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
  const db = await openDB<LibrarySchema>(
    options.name ?? DEFAULT_NAME,
    DB_VERSION,
    {
      upgrade(database, oldVersion) {
        // Each step runs only for databases older than it, so books saved by an earlier
        // version are never touched.
        if (oldVersion < 1) {
          database.createObjectStore('books', { keyPath: 'hash' });
          const registry = database.createObjectStore('registry', {
            keyPath: 'entry.hash',
          });
          registry.createIndex('seq', 'seq', { unique: true });
        }
        if (oldVersion < 2) {
          database.createObjectStore('vectors', {
            keyPath: ['hash', 'model', 'chapter'],
          });
        }
      },
    },
  );
  return new IndexedDbLibrary(db);
}
