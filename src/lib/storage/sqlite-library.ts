import { toRegistryEntry } from '../ingest/classify';
import { DuplicateHashError, matchesTitleOrFilename } from '../ingest/registry';
import type { Book, Registry, RegistryEntry } from '../ingest/types';
import type {
  ChapterVectors,
  SavedChapter,
  VectorStore,
} from '../indexing/types';
import { StorageFullError } from './errors';
import type { BookLibrary } from './library';
import { decodeFloats, encodeFloats, type SqlDatabase } from './sql';
import { assertChapterVectors } from './vectors';

/**
 * One row per book, holding its registry record and (once saved) the book itself, so
 * saving both together is a single statement. One row per chapter of vectors, so a
 * chapter is saved whole or not at all. See the sqlite-storage change's design.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS books (
    hash TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    entry TEXT NOT NULL,
    book TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS vectors (
    hash TEXT NOT NULL,
    model TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    dimension INTEGER NOT NULL,
    chunk_ids TEXT NOT NULL,
    vectors TEXT NOT NULL,
    PRIMARY KEY (hash, model, chapter)
  )`,
];

/** The next insertion number, so `list()` keeps the order books were added in. */
const NEXT_SEQ = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM books)';

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const isDuplicate = (error: unknown): boolean =>
  /UNIQUE constraint failed|PRIMARY KEY/i.test(message(error));
const isFull = (error: unknown): boolean =>
  /database or disk is full|SQLITE_FULL/i.test(message(error));

/** Maps SQLite's own errors to the ones the rest of the app already handles. */
function translate(error: unknown, hash: string): unknown {
  if (isFull(error)) return new StorageFullError();
  if (isDuplicate(error)) return new DuplicateHashError(hash);
  return error;
}

interface EntryRow {
  entry: string;
}

interface VectorRow {
  hash: string;
  model: string;
  chapter: number;
  dimension: number;
  chunk_ids: string;
  vectors: string;
}

class SqliteRegistry implements Registry {
  constructor(private readonly db: SqlDatabase) {}

  async get(hash: string): Promise<RegistryEntry | undefined> {
    const [row] = await this.db.select<EntryRow>(
      'SELECT entry FROM books WHERE hash = ?',
      [hash],
    );
    return row ? (JSON.parse(row.entry) as RegistryEntry) : undefined;
  }

  async findByTitleOrFilename(
    title: string,
    filename?: string,
  ): Promise<RegistryEntry[]> {
    return (await this.list()).filter((entry) =>
      matchesTitleOrFilename(entry, title, filename),
    );
  }

  async add(entry: RegistryEntry): Promise<void> {
    if (await this.get(entry.hash)) throw new DuplicateHashError(entry.hash);
    try {
      await this.db.execute(
        `INSERT INTO books (hash, seq, entry, book) VALUES (?, ${NEXT_SEQ}, ?, NULL)`,
        [entry.hash, JSON.stringify(entry)],
      );
    } catch (error) {
      throw translate(error, entry.hash);
    }
  }

  async list(): Promise<RegistryEntry[]> {
    const rows = await this.db.select<EntryRow>(
      'SELECT entry FROM books ORDER BY seq',
    );
    return rows.map((row) => JSON.parse(row.entry) as RegistryEntry);
  }

  /**
   * Removes the record, the stored book and every vector. Vectors go first: if the app
   * stops in between, what is left is a book without vectors, which is indexed again,
   * never vectors without their book. The reader's EPUB is never touched.
   */
  async remove(hash: string): Promise<boolean> {
    const existed = (await this.get(hash)) !== undefined;
    await this.db.execute('DELETE FROM vectors WHERE hash = ?', [hash]);
    await this.db.execute('DELETE FROM books WHERE hash = ?', [hash]);
    return existed;
  }
}

class SqliteVectors implements VectorStore {
  constructor(private readonly db: SqlDatabase) {}

  async savedChapters(hash: string, model: string): Promise<SavedChapter[]> {
    return this.db.select<SavedChapter>(
      'SELECT chapter, dimension FROM vectors WHERE hash = ? AND model = ? ORDER BY chapter',
      [hash, model],
    );
  }

  async loadChapter(
    hash: string,
    model: string,
    chapter: number,
  ): Promise<ChapterVectors | undefined> {
    const [row] = await this.db.select<VectorRow>(
      'SELECT * FROM vectors WHERE hash = ? AND model = ? AND chapter = ?',
      [hash, model, chapter],
    );
    if (!row) return undefined;
    return {
      hash: row.hash,
      model: row.model,
      chapter: row.chapter,
      dimension: row.dimension,
      chunkIds: JSON.parse(row.chunk_ids) as string[],
      vectors: decodeFloats(row.vectors),
    };
  }

  async saveChapter(record: ChapterVectors): Promise<void> {
    assertChapterVectors(record);
    try {
      await this.db.execute(
        `INSERT OR REPLACE INTO vectors (hash, model, chapter, dimension, chunk_ids, vectors)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          record.hash,
          record.model,
          record.chapter,
          record.dimension,
          JSON.stringify(record.chunkIds),
          encodeFloats(record.vectors),
        ],
      );
    } catch (error) {
      throw isFull(error) ? new StorageFullError() : error;
    }
  }

  async discard(hash: string, model: string): Promise<void> {
    await this.db.execute('DELETE FROM vectors WHERE hash = ? AND model = ?', [
      hash,
      model,
    ]);
  }

  async discardOtherModels(hash: string, keepModel: string): Promise<void> {
    await this.db.execute('DELETE FROM vectors WHERE hash = ? AND model <> ?', [
      hash,
      keepModel,
    ]);
  }

  async modelsWithVectors(hash: string): Promise<string[]> {
    const rows = await this.db.select<{ model: string }>(
      'SELECT DISTINCT model FROM vectors WHERE hash = ? ORDER BY model',
      [hash],
    );
    return rows.map((row) => row.model);
  }
}

class SqliteLibrary implements BookLibrary {
  readonly registry: Registry;
  readonly vectors: VectorStore;

  constructor(private readonly db: SqlDatabase) {
    this.registry = new SqliteRegistry(db);
    this.vectors = new SqliteVectors(db);
  }

  /** The record and the book in one statement, so neither can exist without the other. */
  async saveBook(book: Book): Promise<void> {
    if (await this.registry.get(book.hash))
      throw new DuplicateHashError(book.hash);
    try {
      await this.db.execute(
        `INSERT INTO books (hash, seq, entry, book) VALUES (?, ${NEXT_SEQ}, ?, ?)`,
        [
          book.hash,
          JSON.stringify(toRegistryEntry(book)),
          JSON.stringify(book),
        ],
      );
    } catch (error) {
      throw translate(error, book.hash);
    }
  }

  async getBook(hash: string): Promise<Book | undefined> {
    const [row] = await this.db.select<{ book: string | null }>(
      'SELECT book FROM books WHERE hash = ?',
      [hash],
    );
    return row?.book ? (JSON.parse(row.book) as Book) : undefined;
  }

  close(): void {
    void this.db.close();
  }
}

/** Opens the library in a SQLite database, creating its tables if needed. */
export async function openSqliteLibrary(db: SqlDatabase): Promise<BookLibrary> {
  for (const statement of SCHEMA) await db.execute(statement);
  return new SqliteLibrary(db);
}
