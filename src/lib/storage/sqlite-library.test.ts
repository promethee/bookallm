// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeChapterVectors } from '../indexing/testing/vector-store-contract';
import type { Book } from '../ingest/types';
import { StorageFullError } from './errors';
import { decodeFloats, encodeFloats, type SqlDatabase } from './sql';
import { openSqliteLibrary } from './sqlite-library';
import { nodeSqliteDatabase } from './testing/node-sqlite';

const HASH = 'a'.repeat(64);

const book = (hash = HASH): Book => ({
  hash,
  title: 'Candide',
  authors: ['Voltaire'],
  language: 'en',
  sourceFilename: 'candide.epub',
  chapters: [{ number: 1, title: 'One', text: 'Candide reached Lisbon.' }],
  chunks: [
    {
      id: `${hash.slice(0, 16)}:1:0`,
      text: 'Candide reached Lisbon.',
      locator: {
        chapterNumber: 1,
        chapterTitle: 'One',
        paragraphStart: 0,
        paragraphEnd: 0,
        charStart: 0,
        charEnd: 23,
      },
    },
  ],
});

describe('encodeFloats / decodeFloats', () => {
  it('round-trips every number exactly', () => {
    const values = Float32Array.from([0, 1, -1, 0.1, 3.4e38, -1e-38, NaN]);

    const back = decodeFloats(encodeFloats(values));

    expect([...back].map(String)).toEqual([...values].map(String));
  });

  it('handles a vector longer than one encoding chunk', () => {
    const values = Float32Array.from({ length: 50_000 }, (_, i) => i / 7);

    expect(decodeFloats(encodeFloats(values))).toEqual(values);
  });

  it('encodes a view into a larger buffer without its neighbours', () => {
    const whole = Float32Array.from([1, 2, 3, 4]);

    expect([...decodeFloats(encodeFloats(whole.subarray(1, 3)))]).toEqual([
      2, 3,
    ]);
  });
});

describe('the SQLite library in a file', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('keeps books and vectors when the database is opened again', async () => {
    dir = mkdtempSync(join(tmpdir(), 'bookallm-sqlite-'));
    const path = join(dir, 'bookallm.db');
    const first = await openSqliteLibrary(nodeSqliteDatabase(path));
    await first.saveBook(book());
    const record = makeChapterVectors({ hash: HASH });
    await first.vectors.saveChapter(record);
    first.close();

    const again = await openSqliteLibrary(nodeSqliteDatabase(path));

    expect(await again.getBook(HASH)).toEqual(book());
    expect(await again.registry.list()).toHaveLength(1);
    expect(await again.vectors.loadChapter(HASH, record.model, 1)).toEqual(
      record,
    );
    again.close();
  });
});

describe('the SQLite library when the disk is full', () => {
  /** A database whose writes fail as SQLite does when the disk is full. */
  function fullAfterSchema(): SqlDatabase {
    const real = nodeSqliteDatabase();
    let ready = false;
    return {
      async execute(sql, values) {
        if (ready) throw new Error('database or disk is full');
        await real.execute(sql, values);
        if (sql.includes('CREATE TABLE IF NOT EXISTS vectors')) ready = true;
      },
      select: (sql, values) => real.select(sql, values),
      close: () => real.close(),
    };
  }

  it('reports a book that cannot be saved as storage full', async () => {
    const library = await openSqliteLibrary(fullAfterSchema());

    await expect(library.saveBook(book())).rejects.toBeInstanceOf(
      StorageFullError,
    );
    expect(await library.getBook(HASH)).toBeUndefined();
  });

  it('reports vectors that cannot be saved as storage full', async () => {
    const library = await openSqliteLibrary(fullAfterSchema());

    await expect(
      library.vectors.saveChapter(makeChapterVectors({ hash: HASH })),
    ).rejects.toBeInstanceOf(StorageFullError);
  });
});
