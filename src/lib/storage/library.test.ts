// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRegistryEntry } from '../ingest/classify';
import { DuplicateHashError } from '../ingest/registry';
import { runRegistryContract } from '../ingest/testing/registry-contract';
import {
  makeChapterVectors,
  runVectorStoreContract,
} from '../indexing/testing/vector-store-contract';
import type { Book } from '../ingest/types';
import { openLibrary, StorageFullError, type BookLibrary } from './library';
import { MemoryLibrary } from './memory-library';

let counter = 0;
const nextName = () => `library-test-${(counter += 1)}`;

runRegistryContract(
  'IndexedDB library',
  async () => (await openLibrary({ name: nextName() })).registry,
);
runRegistryContract('in-memory library', () => new MemoryLibrary().registry);
runVectorStoreContract(
  'IndexedDB library',
  async () => (await openLibrary({ name: nextName() })).vectors,
);
runVectorStoreContract('in-memory library', () => new MemoryLibrary().vectors);

const makeBook = (hash: string, title = 'Candide'): Book => ({
  hash,
  title,
  authors: ['Voltaire'],
  language: 'fr',
  sourceFilename: `${title}.epub`,
  chapters: [{ number: 1, title: 'Un', text: 'Il était une fois.' }],
  chunks: [
    {
      id: `${hash.slice(0, 16)}:1:0`,
      text: 'Il était une fois.',
      locator: {
        chapterNumber: 1,
        chapterTitle: 'Un',
        paragraphStart: 0,
        paragraphEnd: 0,
        charStart: 0,
        charEnd: 18,
      },
    },
  ],
});

const openers: [string, () => Promise<BookLibrary>][] = [
  ['IndexedDB library', () => openLibrary({ name: nextName() })],
  ['in-memory library', async () => new MemoryLibrary()],
];

describe.each(openers)('%s books', (_name, open) => {
  it('saves a book together with its registry entry', async () => {
    const library = await open();
    const book = makeBook('a'.repeat(64));

    await library.saveBook(book);

    expect(await library.getBook(book.hash)).toEqual(book);
    expect(await library.registry.get(book.hash)).toMatchObject({
      hash: book.hash,
      title: 'Candide',
      chapterCount: 1,
      chunkCount: 1,
    });
  });

  it('finds nothing for an unknown book', async () => {
    const library = await open();

    expect(await library.getBook('f'.repeat(64))).toBeUndefined();
  });

  it('rejects a book whose hash is already saved and leaves the original alone', async () => {
    const library = await open();
    await library.saveBook(makeBook('a'.repeat(64), 'First'));

    await expect(
      library.saveBook(makeBook('a'.repeat(64), 'Second')),
    ).rejects.toBeInstanceOf(DuplicateHashError);

    expect((await library.getBook('a'.repeat(64)))?.title).toBe('First');
    expect(await library.registry.list()).toHaveLength(1);
  });

  it('removes the record and the stored content together', async () => {
    const library = await open();
    const book = makeBook('a'.repeat(64));
    await library.saveBook(book);

    expect(await library.registry.remove(book.hash)).toBe(true);

    expect(await library.getBook(book.hash)).toBeUndefined();
    expect(await library.registry.get(book.hash)).toBeUndefined();
  });

  it('removes the vectors of every model together with the book, and only that book', async () => {
    const library = await open();
    const book = makeBook('a'.repeat(64));
    const other = makeBook('b'.repeat(64), 'Other');
    await library.saveBook(book);
    await library.saveBook(other);
    for (const model of ['bge-m3:latest', 'old:latest'])
      await library.vectors.saveChapter(
        makeChapterVectors({ hash: book.hash, model }),
      );
    await library.vectors.saveChapter(makeChapterVectors({ hash: other.hash }));

    await library.registry.remove(book.hash);

    expect(await library.vectors.modelsWithVectors(book.hash)).toEqual([]);
    expect(await library.vectors.modelsWithVectors(other.hash)).toEqual([
      'bge-m3:latest',
    ]);
  });

  it('lists books in the order they were saved, not by hash', async () => {
    const library = await open();
    const hashes = ['c'.repeat(64), 'a'.repeat(64), 'b'.repeat(64)];
    for (const hash of hashes)
      await library.saveBook(makeBook(hash, `Book ${hash[0]}`));

    expect((await library.registry.list()).map((entry) => entry.hash)).toEqual(
      hashes,
    );
  });

  it('hands out copies, so callers cannot change what is stored', async () => {
    const library = await open();
    const book = makeBook('a'.repeat(64));
    await library.saveBook(book);

    const copy = await library.getBook(book.hash);
    copy!.title = 'Tampered';
    book.title = 'Also tampered';

    expect((await library.getBook(book.hash))?.title).toBe('Candide');
  });

  it('saves the same book only once when two saves race', async () => {
    const library = await open();
    const book = makeBook('a'.repeat(64));

    const results = await Promise.allSettled([
      library.saveBook(book),
      library.saveBook(book),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DuplicateHashError);
    expect(await library.registry.list()).toHaveLength(1);
  });
});

describe('IndexedDB library specifics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps books after a restart (closing and reopening the database)', async () => {
    const name = nextName();
    const first = await openLibrary({ name });
    const book = makeBook('a'.repeat(64));
    await first.saveBook(book);
    first.close();

    const second = await openLibrary({ name });

    expect(await second.getBook(book.hash)).toEqual(book);
    expect((await second.registry.list()).map((entry) => entry.hash)).toEqual([
      book.hash,
    ]);
  });

  it('keeps insertion order across a restart and continues it afterwards', async () => {
    const name = nextName();
    const first = await openLibrary({ name });
    await first.saveBook(makeBook('c'.repeat(64)));
    await first.saveBook(makeBook('a'.repeat(64)));
    first.close();

    const second = await openLibrary({ name });
    await second.saveBook(makeBook('b'.repeat(64)));

    expect(
      (await second.registry.list()).map((entry) => entry.hash[0]),
    ).toEqual(['c', 'a', 'b']);
  });

  it('leaves neither the entry nor the content when a save fails part-way', async () => {
    const library = await openLibrary({ name: nextName() });
    const broken = makeBook('a'.repeat(64));
    // A function cannot be stored, so writing the content fails after the entry was written.
    (broken.chunks[0] as unknown as Record<string, unknown>).unstorable = () =>
      1;

    await expect(library.saveBook(broken)).rejects.toThrow();

    expect(await library.registry.list()).toEqual([]);
    expect(await library.getBook(broken.hash)).toBeUndefined();
  });

  it('turns a full disk into a typed error and leaves nothing behind', async () => {
    const library = await openLibrary({ name: nextName() });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('no room', 'QuotaExceededError');
    });

    await expect(
      library.saveBook(makeBook('a'.repeat(64))),
    ).rejects.toBeInstanceOf(StorageFullError);

    vi.restoreAllMocks();
    expect(await library.registry.list()).toEqual([]);
    expect(await library.getBook('a'.repeat(64))).toBeUndefined();
  });

  it('can still save after a failed save', async () => {
    const library = await openLibrary({ name: nextName() });
    const broken = makeBook('a'.repeat(64));
    (broken.chunks[0] as unknown as Record<string, unknown>).unstorable = () =>
      1;
    await expect(library.saveBook(broken)).rejects.toThrow();

    await library.saveBook(makeBook('b'.repeat(64)));

    expect(
      (await library.registry.list()).map((entry) => entry.hash[0]),
    ).toEqual(['b']);
  });

  it('removes only its own record: an entry added without content can be removed too', async () => {
    const library = await openLibrary({ name: nextName() });
    const entry = {
      hash: 'a'.repeat(64),
      title: 'Bare',
      authors: [],
      language: 'en',
      chapterCount: 0,
      chunkCount: 0,
      importedAt: '2026-01-01T00:00:00.000Z',
    };
    await library.registry.add(entry);

    expect(await library.registry.remove(entry.hash)).toBe(true);
    expect(await library.registry.remove(entry.hash)).toBe(false);
  });
});

describe('IndexedDB library vectors', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps vectors after a restart', async () => {
    const name = nextName();
    const first = await openLibrary({ name });
    const record = makeChapterVectors();
    await first.vectors.saveChapter(record);
    first.close();

    const second = await openLibrary({ name });

    expect(
      await second.vectors.loadChapter(record.hash, record.model, 1),
    ).toEqual(record);
    expect(
      await second.vectors.savedChapters(record.hash, record.model),
    ).toEqual([{ chapter: 1, dimension: 3 }]);
  });

  it('turns a full disk into a typed error and stores no part of the chapter', async () => {
    const library = await openLibrary({ name: nextName() });
    const record = makeChapterVectors();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('no room', 'QuotaExceededError');
    });

    await expect(library.vectors.saveChapter(record)).rejects.toBeInstanceOf(
      StorageFullError,
    );

    vi.restoreAllMocks();
    expect(
      await library.vectors.savedChapters(record.hash, record.model),
    ).toEqual([]);
  });

  it('can still save vectors after a failed save', async () => {
    const library = await openLibrary({ name: nextName() });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('no room', 'QuotaExceededError');
    });
    await expect(
      library.vectors.saveChapter(makeChapterVectors()),
    ).rejects.toBeInstanceOf(StorageFullError);

    await library.vectors.saveChapter(makeChapterVectors({ chapter: 2 }));

    expect(
      await library.vectors.savedChapters(
        makeChapterVectors().hash,
        'bge-m3:latest',
      ),
    ).toEqual([{ chapter: 2, dimension: 3 }]);
  });
});

describe('upgrading a version 1 library', () => {
  it('keeps every book and registry entry and starts with no vectors', async () => {
    const name = nextName();
    // A database exactly as the first release created it: no `vectors` store.
    const old = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('books', { keyPath: 'hash' });
        const registry = database.createObjectStore('registry', {
          keyPath: 'entry.hash',
        });
        registry.createIndex('seq', 'seq', { unique: true });
      },
    });
    const books = [
      makeBook('a'.repeat(64), 'First'),
      makeBook('b'.repeat(64), 'Second'),
    ];
    for (const [position, book] of books.entries()) {
      await old.put('books', book);
      await old.put('registry', {
        seq: position + 1,
        entry: toRegistryEntry(book),
      });
    }
    old.close();

    const library = await openLibrary({ name });

    expect((await library.registry.list()).map((entry) => entry.title)).toEqual(
      ['First', 'Second'],
    );
    expect(await library.getBook(books[1].hash)).toEqual(books[1]);
    for (const book of books)
      expect(await library.vectors.modelsWithVectors(book.hash)).toEqual([]);

    // The upgraded library takes new books and vectors like any other.
    await library.vectors.saveChapter(
      makeChapterVectors({ hash: books[0].hash }),
    );
    await library.saveBook(makeBook('c'.repeat(64), 'Third'));
    expect(await library.registry.list()).toHaveLength(3);
  });
});
