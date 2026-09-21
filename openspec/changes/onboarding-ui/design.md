# Design

## Context

The frontend is a placeholder in `src/App.svelte` (Svelte 5, Vite, Tailwind v4). Two verified headless cores exist: `src/lib/ingest` (`ingestEpub`, `InMemoryRegistry`, `toRegistryEntry`) and `src/lib/ollama` (`checkSetup`, `pullMissingModels`, `planDownloads`, `installGuidance`). Both return typed codes and data, never wording. Motivation and scope: see proposal.md; behavior: see the five delta specs.

Grounded facts:

- Tauri intercepts OS file drops by default; its own schema says disabling `dragDropEnabled` "is required to use HTML5 drag and drop on the frontend on Windows". This is a JSON-only change.
- The opener plugin needs the `tauri-plugin-opener` crate, the `@tauri-apps/plugin-opener` package, the line `.plugin(tauri_plugin_opener::init())`, and a capability `opener:allow-open-url` that can be scoped to a URL pattern (`https://ollama.com/*`). Its docs do not promise that plain `<a target=_blank>` links open, so the app calls `openUrl()` explicitly.
- On Ollama 0.34.0, plain `fetch` from a webview origin works (checked in `ollama-setup`), so no HTTP plugin is needed.

## Goals / Non-Goals

**Goals:**
- Every screen is chosen by one pure function of real state, so it is testable without a browser.
- All visible text comes from language tables; components contain no literal user-facing strings.
- Storage sits behind interfaces so files or SQLite can replace it later.
- Fakes for Ollama and storage let every screen be tested without a network or a browser database.

**Non-Goals:**
- Embeddings, Ask and Verify modes, the top bar, book switching or deleting, the command palette, systray behavior, a full settings screen, and a per-chapter import counter (the slow part it would report does not exist yet).

## Decisions

1. **Layout.** `src/lib/i18n/` (messages, language state, detection, formatting), `src/lib/storage/` (settings, book library, registry, fallbacks), `src/lib/onboarding/` (screen decision, controller), `src/lib/platform.ts` (platform detection, safe external opening), `src/components/` (screens and small shared parts). `App.svelte` becomes the shell: header with app name and language control, the current screen, and a polite live region.
2. **Screen decision is a pure function.** `decideScreen({ language, readiness, bookCount, importPostponed, importRequested })` returns `language | checking | get-ollama | update-ollama | pull-models | import-book | landing`, in the order the spec fixes. `readiness` is `undefined` while checking. No "setup finished" flag exists; the screen follows `checkSetup` and the book list, so it cannot drift from reality.
3. **Controller.** A Svelte 5 rune-based controller (`controller.svelte.ts`) owns the state and the actions (choose language, re-check, confirm models, start, cancel and resume a pull, import a file, add a duplicate separately, cancel a duplicate, postpone). Components call actions and render state; they do not talk to Ollama or storage directly. Services (Ollama client factory, storage, platform, opener) are passed in through Svelte context, so tests supply fakes.
4. **Waiting screens poll.** While the get-Ollama or update-Ollama screen is up, the controller runs `checkSetup` every 3 seconds, skips a tick if a check is still running, and clears the timer when the screen changes or the component is destroyed. The download screen does not poll: it holds its own pull state and re-checks once when the pull ends.
5. **Download screen.** It reads the plan from readiness, shows two editable name fields (chat, embedding) prefilled from settings or defaults, and re-runs `checkSetup` on change with the edited names to refresh the list and sizes. The download button calls `pullMissingModels` with an `AbortController`; `onProgress` feeds the model name, phase text, bytes (formatted for the language) and a `role="progressbar"` element. Cancel aborts; continue calls `pullMissingModels` again, which resumes. Pull error codes map to message keys plus a retry; `pull-failed` puts Ollama's message in a closed details element.
6. **Language.** English is the source table; French is typed against the same keys, so a missing French key is a compile error. `t(key, params)` reads a rune holding the current language and falls back to English if a key is somehow undefined, never showing a key. Messages are strings with `{name}` slots, or functions where a plural needs logic. Sizes use `Intl.NumberFormat` with the `byte` family units (`gigabyte`, `megabyte`, short display), which gives "GB" in English and "Go" in French. Detection: the first entry of `navigator.languages` that is English or French decides (`['en-US', 'fr']` gives English, `['de', 'fr-CA']` gives French); anything else gives English. The French text is written by the assistant and has not had a native review.
7. **Settings.** Saved as one versioned JSON object in `localStorage` (`language`, `chatModel`, `embeddingModel`, `ollamaUrl`, `activeBook`). Each field is validated on read (language must be a known code, model names non-empty text, the address a valid `http(s)` URL) and falls back to its default independently; unparseable JSON gives all defaults. Reads and writes are wrapped so blocked or full storage degrades to an in-memory copy and raises a "not remembered" notice instead of throwing.
8. **Books in IndexedDB.** Database `bookallm`, version 1, using the small `idb` wrapper. Object store `books` holds `Book` by hash; object store `registry` holds `{ seq, entry }` keyed by `entry.hash`, with an index on `seq` so `list()` keeps insertion order. `IndexedDbRegistry` implements `Registry`; `add` rejects a duplicate hash with `DuplicateHashError`; `remove` deletes the record and the content in one transaction. A `BookLibrary` adds `saveBook(book)`, one transaction over both stores, so an entry never exists without content or the reverse, and `getBook(hash)`. A full disk surfaces as a typed storage-full error. The persistent registry is checked with the shared registry contract suite from `ingest`, run against `fake-indexeddb`.
9. **Active book.** The saved hash if its entry exists, else the most recently imported entry, else none. Importing or recognising an existing book sets it.
10. **Import pipeline.** The controller marks "working", yields one animation frame so the wait message paints, reads the file into bytes, runs `ingestEpub` with the persistent registry, and branches on the result: `existing` sets active and says so; `new` saves then sets active; `possible-duplicate` keeps the parsed book in memory and shows the two-button question (nothing is saved until "add as a separate book"); `error` maps the code to a message. Saving failures map to "could not be saved". The source `File` is only read.
11. **Import UI.** A labelled drop area that is also a button opening a hidden `<input type=file accept=".epub,application/epub+zip">`, so keyboard and mouse both work. Multiple files: the first is used and the rest are reported as skipped. Ingestion runs on the main thread; a Web Worker is a later option if large books freeze the window.
12. **Tauri wiring.** Add `tauri-plugin-opener` to `Cargo.toml`, register it in `lib.rs`, add the capability `opener:allow-open-url` scoped to `https://ollama.com/*` to `capabilities/default.json`, and set `dragDropEnabled: false` on the main window. `openExternal(url)` first checks the address against an allow-list (`https`, host exactly `ollama.com`); inside Tauri it calls `openUrl` (loaded only when `__TAURI_INTERNALS__` exists), otherwise `window.open`. Two layers refuse anything else: the app allow-list and the capability scope.
13. **Accessibility.** Each screen has one `h1`; the controller moves focus to it on every screen change; errors and completion go to a polite live region; all controls are native buttons, inputs, labels and a `details` element; the progress bar carries value, min and max.
14. **Tests.** Unit tests for language tables (key parity, detection, fallback, formatting), settings validation, the IndexedDB stores (contract suite, atomic save and remove, injected storage-full), `decideScreen` as a table, the controller with fake services and fake timers, and the opener allow-list. Component tests render each screen with Testing Library. Playwright (Chromium) drives the whole flow with Ollama mocked by request interception and a generated EPUB from the ingestion test builder, including reload persistence. Two things only a real run can show, checked with the user: the opener and drag-drop inside the real Tauri window, and a run against the real Ollama.
15. **Copy.** Plain language for readers, not developers: no "API", "daemon", "model tag" or "SHA". Wording lives only in the language tables.

## Risks / Trade-offs

- [The French copy is written by the assistant and unreviewed] → It lives only in one table, is easy to edit, and the summary flags it for a native read.
- [WebKit (macOS) and Linux webviews may evict or restrict IndexedDB and storage differently, and only Windows is available here] → Ask the browser to make storage persistent at startup where supported, keep the interface swappable, and rely on re-importing (the EPUBs are never touched). The release matrix change should test macOS and Linux.
- [Ingestion on the main thread can freeze the window for large books] → Yield a frame first so the wait message shows; Pride and Prejudice ingests in well under a second in Node; move to a worker if real books are slower.
- [Drag-and-drop behavior differs by platform and can only be confirmed in the real window] → `dragDropEnabled: false` is documented for Windows; the file picker is always available as the fallback.
- [The opener's real behavior (opens the browser, refuses other addresses) needs a real window] → The app allow-list is unit-tested, the capability scope is a second layer, and the user confirms the button in `tauri dev`.
- [The import wait state cannot show per-chapter progress] → It says plainly that it is reading the book; the counter arrives with real indexing in the embeddings change.
- [Adding a duplicate as a separate book leaves two similar entries] → It is the reader's explicit choice; the later library screen adds "remove this book".
- [One long Rust rebuild for the opener plugin, about 20 minutes] → Done once, early in the tasks, while other work continues.
- [Storage blocked or full] → In-memory fallback for the session plus a plain notice, and typed errors for saves.

## Open Questions

- Where the language control lives once a settings screen exists is left to that later change; it stays in the header until then.
