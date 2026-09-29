# Proposal

## Why

INTENT.md sets the storage as "SQLite + a vector extension, or flat-file embeddings". The app instead keeps books, the registry and vectors in the webview's IndexedDB, chosen during onboarding-ui and never flagged as a change to a core decision. The 2026-09-29 drift review settled it: the library moves to SQLite. Doing it before the first release means nobody's data has to be migrated. It also puts the library in a real file in the app's data folder instead of the webview's private storage, which a WebView update, a cache clean-up or WebKit's storage eviction on macOS and Linux can remove.

## What Changes

- In the desktop app, the library (registry records, stored books, and vectors for every embedding model) lives in a SQLite database file, `bookallm.db`, in the app's data folder, through Tauri's official SQL plugin.
- The browser build used for development and the automated tests keeps the current IndexedDB and in-memory implementations; the app picks SQLite only inside the desktop app.
- The SQLite implementation passes the same registry and vector-store contract test suites as the others, run against a real SQLite database with Node's built-in `node:sqlite`.
- New dependencies: the `tauri-plugin-sql` crate (with its `sqlite` feature) and the `@tauri-apps/plugin-sql` npm package, both official Tauri plugins. No vector extension: vectors are stored as compact binary text, and search keeps ranking them in TypeScript as today.
- `MANUAL_TESTS.md` gains a section for checking storage in the desktop app.

### Non-goals

- Settings: they stay in the webview's local storage (a handful of small values read synchronously at start). Moving them is a separate decision.
- A vector extension (such as `sqlite-vec`) or faster search: search already takes about a second per question on a whole book.
- Migrating existing IndexedDB data: there is no release yet. On a machine that used the desktop app before, books are imported again once.
- A user-configurable database location (INTENT.md: a later version).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `local-persistence`: a new requirement that the desktop app keeps its library in a SQLite database file in its data folder, with every existing requirement (survives a restart, saved together, removal, storage problems reported) holding for it too.

## Impact

- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (register the plugin), `src-tauri/tauri.conf.json` (preload the database) and `src-tauri/capabilities/default.json` (the plugin's permissions).
- `package.json`: `@tauri-apps/plugin-sql`.
- New `src/lib/storage/sqlite-library.ts` implementing `BookLibrary` over a small database interface, with a `node:sqlite` adapter for tests; `src/lib/storage/open.ts` picks it in the desktop app.
- `MANUAL_TESTS.md`, `INTENT.md` (Roadmap).
