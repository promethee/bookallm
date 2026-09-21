# Proposal

## Why

The two headless cores are done and verified: EPUB ingestion and Ollama setup. Nothing in the app shows them yet, so a reader launching BookaLLM still sees a placeholder. README onboarding defines the first-run experience: detect Ollama, guide the install, confirm and pull the default models, import an EPUB, land in Ask mode, all in plain language for readers rather than developers. The interface language is meant to be a user-selectable setting, and both cores were built to return codes and data rather than wording precisely so this change can supply the text. Books and settings must also survive a restart, which nothing does today.

## What Changes

- Add a first-run flow whose screen is decided from the real state on every launch: choose a language (first launch only), get or update Ollama, pull models, import a first book, then land on an Ask-mode placeholder.
- Add the Ollama screens: plain-language install guidance with a button that opens the official download page, waiting and re-checking until Ollama appears, a model confirmation screen with editable model names, an explicit download with progress, cancel and retry, and friendly messages for every error code.
- Add the import screen: a file picker and drag-and-drop for EPUBs, a plain wait state, a result summary, a friendly message for each error code (including DRM), recognition of a book already imported, and a possible-duplicate question with two answers: add as a separate book, or cancel.
- Add an interface-language setting with English and French, defaulting to the system language, changeable at any time.
- Persist settings (language, model names, Ollama address, active book) in browser local storage and imported books (registry entries plus book text) in the webview's IndexedDB, both behind interfaces so files or SQLite can replace them later.
- Add the Tauri opener plugin, restricted to `https://ollama.com/*`, and turn off Tauri's own file-drop handling so drag-and-drop reaches the page.
- No "setup completed" flag is stored: the screen is derived from what is really installed, so it can never disagree with reality (for example if Ollama is later stopped).
- Out of scope: embeddings and indexing (so the import wait state has no chapter-by-chapter counter yet), Ask and Verify modes, the top bar, book switching, deleting books, the command palette, the systray and idle-unload behavior, and a full settings screen.

## Capabilities

### New Capabilities

- `first-run-flow`: decide and show the right setup screen from the real state, re-check while waiting, and land on the Ask-mode placeholder.
- `ollama-onboarding`: the screens that get Ollama running and the models installed, with explicit downloads, progress, cancel and friendly errors.
- `book-import`: the screens that import an EPUB, report every outcome in plain language, and never overwrite or delete anything.
- `interface-language`: English and French, chosen at first launch or later, applied to all text.
- `local-persistence`: settings and imported books that survive a restart, with failures reported plainly.

### Modified Capabilities

None. The existing specs describe the headless cores, and this change only presents them.

## Impact

- New code under `src/lib/i18n/`, `src/lib/storage/`, `src/lib/onboarding/` and `src/components/`, with colocated tests. `src/App.svelte` becomes the shell.
- New runtime dependencies: `idb` (a small IndexedDB wrapper) and `@tauri-apps/plugin-opener`; new dev dependency `fake-indexeddb` for tests.
- First Rust change since the scaffold: one plugin line, a capability entry limited to `https://ollama.com/*`, and the `tauri-plugin-opener` crate. It needs one long rebuild (about 20 minutes).
- `tauri.conf.json` gets `dragDropEnabled: false` on the main window.
- Later changes consume this: embeddings and retrieval (the import step gains real indexing progress), Ask mode, the top bar and library, and settings.
