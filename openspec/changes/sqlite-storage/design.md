# Design

## Context

- `BookLibrary` (`src/lib/storage/library.ts`) exposes `registry` (get, find by title or filename, add, list, remove), `vectors` (`VectorStore`: savedChapters, loadChapter, saveChapter, discard, discardOtherModels, modelsWithVectors), `saveBook`, `getBook` and `close`. The IndexedDB implementation uses three stores (`registry`, `books`, `vectors`) and one transaction per atomic operation; `MemoryLibrary` mirrors it for tests.
- Reusable contract suites exist: `src/lib/ingest/testing/registry-contract.ts` and `src/lib/indexing/testing/vector-store-contract.ts`. Every implementation must pass them.
- `openStorage` (`src/lib/storage/open.ts`) opens settings and the library and turns failures into a `StorageProblem`.
- The desktop app is Tauri 2.11; the SQL plugin (`tauri-plugin-sql` v2, `@tauri-apps/plugin-sql`) gives the webview `Database.load('sqlite:<file>')`, `execute(sql, values)` and `select(sql, values)`, with the file in the app's config/data folder, and permissions `sql:default` (load, select, close) plus `sql:allow-execute`.
- Node 24 (the version used here and by CI's `lts/*`) includes `node:sqlite`.

## Goals / Non-Goals

**Goals:**

- The SQLite library is written once in TypeScript against a tiny `SqlDatabase` interface (`execute`, `select`), used by the plugin in the app and by `node:sqlite` in tests, so the tests exercise the real SQL.

**Non-Goals:**

- Settings, a vector extension, migration, a configurable path (see proposal).

## Decisions

### 1. Schema: two tables, one row per atomic unit

```sql
CREATE TABLE IF NOT EXISTS books (
  hash TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,   -- insertion order, so list() is stable
  entry TEXT NOT NULL,    -- the registry record, JSON
  book TEXT NOT NULL      -- the book with its chunks, JSON
);
CREATE TABLE IF NOT EXISTS vectors (
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  dimension INTEGER NOT NULL,
  chunk_ids TEXT NOT NULL,  -- JSON array
  vectors TEXT NOT NULL,    -- Float32 bytes, base64
  PRIMARY KEY (hash, model, chapter)
);
```

Putting a book and its registry record in one row makes "saved together" a single `INSERT`, with no transaction needed. A chapter's vectors are one row, so "saved together or not at all" holds the same way. The registry's title and filename lookup reads the `entry` JSON of all rows: a library holds a handful of books.

Alternative: separate `registry` and `books` tables like IndexedDB. Rejected: it would need a transaction spanning two statements, which is the plugin's weak point (decision 3).

### 2. Vectors as base64 text of the Float32 bytes

The plugin sends values as JSON, where a `Float32Array` would become a long array of decimal numbers (about 20 characters per number). The Float32 bytes as base64 take 5.3 characters per number and decode exactly. Encoding and decoding sit in one small helper used by both directions.

Alternative: a `BLOB` column. Rejected: the plugin's JSON bridge has no binary type.

### 3. Atomicity without cross-call transactions

The plugin runs each `execute` on a connection from a pool, so `BEGIN` and `COMMIT` in separate calls are not guaranteed to hit the same connection. Every operation is therefore one statement, except removing a book, which has two: vectors first, then the book. If the app stops between them, what remains is a book without vectors, which the app already treats as "not indexed" and indexes again: never a vector without its book.

The first task checks in the real app whether the plugin runs a multi-statement `execute` as one unit; if it does, removal uses that instead.

**Checked in the desktop app (2026-09-29)**, by attaching Playwright to the running app's WebView2 (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…`) and calling the plugin from inside it: the app created both tables at start; `?` placeholders bind as in `node:sqlite`; and an `execute` holding two statements runs both. Removal still uses two ordered calls, because values cannot be bound across the statements of one call, and the vectors-first order already leaves nothing half-removed that matters. The database file is `%APPDATA%\com.promethee.bookallm\bookallm.db`.

### 4. Choosing the implementation

`openStorage` opens `SqliteLibrary` over the plugin when running inside the desktop app (the same check as `openExternal` and the tray), and `IndexedDbLibrary` otherwise. `SqliteLibrary` never imports the plugin itself: it receives a `SqlDatabase`, and a small `plugin-database.ts` adapts the plugin to it. Tests get a `node:sqlite` adapter.

### 5. Errors

A failed open becomes the existing `unavailable` storage problem. A write rejected because the disk is full (SQLite's `SQLITE_FULL`, "database or disk is full") becomes `StorageFullError`, which the import and indexing flows already report.

### 6. Permissions

The capability gets `sql:default` and `sql:allow-execute`. `tauri.conf.json` preloads `sqlite:bookallm.db`. The plugin cannot restrict which database file the webview opens; the webview only ever loads this app's own interface (no remote content), so that is acceptable, and it is noted here rather than hidden.

## Risks / Trade-offs

- [The plugin's JSON bridge is slow for big books] → Vectors travel base64-encoded, one chapter per call, as IndexedDB did; the real-world check times indexing and a search on _Candide_ against the IndexedDB figures (about 2 minutes, about 1 second).
- [Two storage implementations to keep in step] → Both pass the same contract suites.
- [Books imported in the desktop app before this change disappear from it] → No release yet; the proposal says so, and re-importing restores them.
- [`node:sqlite` behaves differently from the plugin's SQLite] → Same SQL, same engine; the manual desktop check covers the plugin path.

## Real-world check (2026-09-29)

The debug desktop app on the GPU machine (RTX 3060, local Ollama with `llama3.1:8b` and `bge-m3`), driven through its WebView2 with remote debugging so the real app, plugin and database were used. With _Candide_ (Project Gutenberg #19942, 72 contents entries):

| Step | Result |
| --- | --- |
| Import and index | The book row and 72 chapters of vectors in SQLite; nothing in IndexedDB |
| Close the app, start it again | Main screen with the book ready after 13.2 s (including the Ollama checks); not indexed again |
| Delete, then import and index again | 51.7 s from choosing the file to the main screen (IndexedDB run: about 2 minutes, with the models cold) |
| A question, then a second one | 3.4 s, then 2.4 s, each with citations |

- The database is `%APPDATA%\com.promethee.bookallm\bookallm.db`; SQLite keeps recent writes in `bookallm.db-wal` (2.9 MB after indexing _Candide_), so the main file can look small until SQLite merges them.
- No slowdown from the plugin's JSON bridge: base64 vectors keep indexing and search at least as fast as with IndexedDB.
- The reader can repeat the check with the "Storage in SQLite" section of `MANUAL_TESTS.md`; it was run here by driving the desktop app rather than by hand.

## Migration Plan

None (no release). Rollback: revert; the database file is left unused.
