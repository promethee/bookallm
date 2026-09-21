# Tasks

## 1. Tauri wiring and dependencies

- [x] 1.1 Add `idb` and `@tauri-apps/plugin-opener` as dependencies and `fake-indexeddb` as a dev dependency; verify `pnpm install --frozen-lockfile` succeeds and `pnpm peers check` reports no issues
- [x] 1.2 Add the `tauri-plugin-opener` crate, register it in `src-tauri/src/lib.rs`, add the `opener:allow-open-url` permission scoped to `https://ollama.com/*` in `src-tauri/capabilities/default.json`, and set `dragDropEnabled: false` on the main window in `tauri.conf.json`; verify `cargo check` in `src-tauri/` passes (about 20 minutes, run in the background while other work continues) and `pnpm format:rust:check` passes
- [x] 1.3 Commit checkpoint: "Add opener plugin and disable Tauri file drop"

## 2. Interface language foundation

- [x] 2.1 Create the language state and `t(key, params)` in `src/lib/i18n/` with English as the source table, French typed against the same keys, an English fallback, and a start set of shared keys; verify tests for lookup, `{name}` slots, plural functions, the English fallback and that a missing key never renders as a key
- [x] 2.2 Implement language detection from `navigator.languages` (French if the first matching entry starts with `fr`, else English) and `formatBytes` using `Intl.NumberFormat` byte units; verify tests that 4.9 GB reads "4.9 GB" in English and "4,9 Go" in French, and that unknown system languages give English
- [x] 2.3 Add a test that compares the key sets of both languages and fails on any difference; verify it passes now and fails when a key is removed from one table
- [x] 2.4 Commit checkpoint: "Add interface language foundation"

## 3. Persistence

- [x] 3.1 Implement the settings store over `localStorage` with the versioned object, per-field validation and defaults, and an in-memory fallback that reports a problem; verify tests for restore after "restart", nothing saved, corrupt JSON, one invalid field among valid ones, and blocked storage
- [x] 3.2 Implement the IndexedDB library in `src/lib/storage/` (`books` and `registry` stores, `seq` index, `IndexedDbRegistry`, atomic `saveBook`, `getBook`, `remove` of record plus content); verify the shared registry contract suite passes against it using `fake-indexeddb`
- [x] 3.3 Verify atomicity and errors: a save that fails part-way leaves neither entry nor content, a duplicate hash is rejected with `DuplicateHashError`, removing an entry removes its content, `list()` keeps insertion order, and an injected quota error becomes a typed storage-full error
- [x] 3.4 Implement `openStorage()` that falls back to in-memory stores and reports "unavailable" when storage cannot be opened, and asks the browser for persistent storage where supported; verify tests for both the normal and the blocked case
- [x] 3.5 Commit checkpoint: "Add settings and book persistence"

## 4. Flow logic

- [x] 4.1 Implement `decideScreen` and test it as a table covering every row of the first-run-flow order, including "ready with a book", "postponed import" and "import requested from the landing screen"; verify all rows pass
- [x] 4.2 Implement `src/lib/platform.ts` (`detectPlatform`, the `https://ollama.com` allow-list, `openExternal` using `openUrl` inside Tauri and `window.open` otherwise); verify tests that official pages are allowed and every other address (other hosts, `http`, look-alike hosts such as `ollama.com.evil.test`, `javascript:`) is refused
- [x] 4.3 Implement the controller in `src/lib/onboarding/controller.svelte.ts` with the launch sequence, 3-second polling that skips overlapping checks and stops on screen change, and the actions (choose language, re-check, confirm models, pull, cancel, continue, import, add duplicate, cancel duplicate, postpone); verify tests with fake services and fake timers for each scenario in first-run-flow
- [x] 4.4 Commit checkpoint: "Add first-run flow logic"

## 5. Shell, language and landing screens

- [x] 5.1 Turn `src/App.svelte` into the shell (header with app name and language control, current screen, polite live region) with focus moved to each screen's heading; verify component tests for focus on screen change, the always-visible language control and live-region announcements
- [x] 5.2 Add the language screen (preselected from the system language) and the landing screen (mode line, active book, import action, no-book message); verify component tests for French and other system languages, changing language mid-screen without losing state, and both landing variants
- [x] 5.3 Commit checkpoint: "Add app shell, language and landing screens"

## 6. Ollama screens

- [x] 6.1 Add the get-Ollama and update-Ollama screens (plain explanation, ordered steps from the guidance data, note that Ollama may only need starting, download button through `openExternal`, check-again button, closed advanced section for the address with validation); verify component tests for each scenario in ollama-onboarding including an invalid address keeping the old one
- [x] 6.2 Add the model confirmation screen (missing models with sizes in the reader's units, total, one-time explanation, editable names that refresh the plan, unknown sizes, no automatic download); verify component tests for the default plan, a swapped model, an unknown size and that nothing downloads before the button is pressed
- [x] 6.3 Add download progress, cancel, continue and automatic advance, and the plain error messages with retry for each failure code; verify component tests with a fake client for watching a download, cancel then continue, completion, and one test per code (`unreachable`, `model-not-found`, `insufficient-disk-space`, `pull-failed` with details)
- [x] 6.4 Commit checkpoint: "Add Ollama setup screens"

## 7. Book import screens

- [x] 7.1 Add the import screen with the picker, the drop area (also keyboard operable), the wait message shown before work starts, the success summary, the already-imported message, and the several-files message; verify component tests including that the wait message is visible before the result and an untitled book shows its file name
- [x] 7.2 Add the plain error messages for each import failure code, the possible-duplicate question with exactly two actions, and the failed-save message; verify component tests for each code (including the protected-book wording), add-separately leaving both books, cancel saving nothing, and a full disk leaving nothing half-saved
- [x] 7.3 Verify the chosen file is only read: a test that the file object is never written to and that no removal action exists on the screen
- [x] 7.4 Commit checkpoint: "Add book import screens"

## 8. End-to-end

- [x] 8.1 Add a Playwright test for the first-launch flow with Ollama mocked by request interception: language, get-Ollama that advances by itself once the mock starts answering, model confirmation and a mocked download, import of a generated EPUB, and the landing screen; verify it passes
- [x] 8.2 Add Playwright tests for persistence after a reload (language and book), switching language mid-flow, the possible-duplicate question, a protected-book error, and a returning reader landing directly; verify they pass
- [x] 8.3 Commit checkpoint: "Add onboarding end-to-end tests"

## 9. Real-world checks

- [x] 9.1 With the user's approval, start the local Ollama server and drive the running app in the browser against it, confirming the real screens for this machine's state (Ollama ready, `bge-m3` installed, `llama3.1:8b` missing), then stop the server and record the result
- [x] 9.2 Import the real Pride and Prejudice EPUB through the UI in the browser and confirm the summary, persistence after reload, and the duplicate and already-imported messages; record the result. If the file is no longer available, ask the user before downloading it again
- [x] 9.3 With the user, run `pnpm tauri dev` and confirm in the real window that the download button opens the official page in the browser, that dropping an EPUB works, and that a book survives closing and reopening the app; record the result
- [x] 9.4 Ask the user to skim the French text and record any corrections
- [x] 9.5 Commit checkpoint: "Record real-world onboarding checks"

## 10. Wrap-up

- [x] 10.1 Verify `pnpm check` passes end to end
- [x] 10.2 With the user's approval to push, verify CI is green on the pushed branch
- [x] 10.3 Commit checkpoint: "Finish onboarding-ui", then archive the change
