# Tasks

## 1. Library over SQL

- [x] 1.1 Add `src/lib/storage/sql.ts` (the `SqlDatabase` interface), the base64 Float32 helpers (design decision 2) and a `node:sqlite` adapter for tests; verify with unit tests that vectors round-trip exactly
- [x] 1.2 Write `SqliteLibrary` (schema and every `BookLibrary`, registry and vector-store method, design decisions 1, 3 and 5); verify it passes the registry and vector-store contract suites and a `sqlite-library.test.ts` for saveBook/getBook, removal of everything, list order, and disk-full mapping
- [x] 1.3 Run `pnpm exec vitest run src/lib` and `pnpm lint`, then commit ("Add a SQLite implementation of the library")

## 2. Desktop app

- [x] 2.1 Add `tauri-plugin-sql` (sqlite feature) and `@tauri-apps/plugin-sql`, register the plugin, preload `sqlite:bookallm.db` and grant `sql:default` and `sql:allow-execute` (design decision 6); verify with `cargo clippy -- -D warnings`
- [x] 2.2 Add `plugin-database.ts` and make `openStorage` choose SQLite in the desktop app (design decision 4); verify with an `open.test.ts` case that the browser build still gets IndexedDB and that the desktop path gets the SQL library
- [x] 2.3 Build the desktop app and check it starts; check in it whether a multi-statement `execute` is atomic and apply design decision 3 accordingly; then commit ("Store the library in SQLite in the desktop app")

## 3. Checks and wrap-up

- [ ] 3.1 Add a storage section to `MANUAL_TESTS.md` (import, restart keeps the book, delete removes it, the database file exists in the app's data folder); verify with markdownlint
- [ ] 3.2 Run the full suites (`pnpm test`, `pnpm test:e2e`, lint, format, clippy), then commit ("Add storage manual tests")
- [ ] 3.3 With the reader, run the storage section in the desktop app with *Candide*, timing indexing and one search against the IndexedDB figures, and record it in this change's design.md
- [ ] 3.4 Update INTENT.md's Roadmap (SQLite done), then commit ("Finish sqlite-storage")
