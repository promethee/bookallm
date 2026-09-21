# Tasks

## 1. Embedding call

- [x] 1.1 Add `src/lib/indexing/types.ts` with the typed failure codes, the vector record, the progress shape and the `VectorStore` contract, and verify `pnpm typecheck` passes
- [x] 1.2 Add `embedTexts` (`POST /api/embed`, 4 chunks per request, a time limit that grows with the number of texts, abort signal) that validates the answer and returns typed results, and verify its unit tests pass for success, wrong count, empty or non-finite vectors, 404, other errors, connection failure, timeout and abort
- [x] 1.3 Add a deterministic `/api/embed` to the simulated Ollama with switches for a wrong count, a dropped connection after N requests, a missing model and a stall, and verify a test proves equal texts give equal vectors and each switch works
- [x] 1.4 Commit checkpoint: "Add the embedding call"

## 2. Vector storage

- [x] 2.1 Add the in-memory `VectorStore` and a shared contract test suite (save and list chapters, load back the same values, models kept apart, discard, discard other models, a failed save leaves nothing), and verify it passes on the in-memory store
- [x] 2.2 Upgrade the IndexedDB library to version 2 with a `vectors` store keyed by book, model and chapter, expose `vectors` on `BookLibrary` and `MemoryLibrary`, make removing a book delete its vectors in the same transaction, and verify the contract suite passes on `fake-indexeddb` too
- [x] 2.3 Verify with a test that a version 1 database with saved books opens at version 2 with every book and registry entry intact and no vectors, and that a quota error on save becomes `StorageFullError` and stores no part of the chapter
- [x] 2.4 Commit checkpoint: "Store vectors on the device"

## 3. The indexer

- [x] 3.1 Add `indexStatus` (complete, partial with counts, none, plus whether another model's vectors exist) with model names normalised, and verify a table-driven test covers empty chapters, spelling of model names, partial and rebuild cases
- [x] 3.2 Add `indexBook` (group by chapter, skip saved chapters, embed in batches, validate, save per chapter, report progress, check the signal between requests) and verify tests cover full index, resume sending only missing chapters, nothing to do sending no request, progress on resume, and abort keeping saved chapters
- [x] 3.3 Cover model swap (old index kept until the new one completes, then deleted, and kept when interrupted), a changed vector length discarding stale vectors, the typed failures including storage full, and chunk text sent only to the configured address, and verify all pass
- [x] 3.4 Commit checkpoint: "Add the book indexer"

## 4. Flow and controller

- [x] 4.1 Add the `index` input and the `index-book` screen to `decideScreen` in the specified order and verify the table test covers unknown, needed and ready for every readiness step, no active book, and import requested
- [x] 4.2 Add index status, run state, retry and abort-on-destroy to the onboarding controller, computing status after a readiness check, after a book is saved or recognised and after the model names change, and verify controller tests with fake services cover import to done, resume at start, rebuild after a swap, each failure, retry with Ollama stopped and running, and destroy while running
- [x] 4.3 Commit checkpoint: "Wire indexing into the first-run flow"

## 5. Screen and text

- [x] 5.1 Add English and French messages for the indexing screen, its failures, the resume and rebuild notes and the announcements, and verify the language table parity test passes and no message uses an em dash
- [x] 5.2 Add `IndexingScreen.svelte` (title, "chapter k of n", progress bar with value, min and max, one-time note, resume and rebuild lines, failure block with details and retry) and wire it into `App.svelte`, and verify component tests in both languages cover progress, resume, rebuild, each failure and the readable progress bar
- [x] 5.3 Update the "reading a book" wait wording only if it now contradicts the indexing screen, and verify the import screen tests still pass
- [x] 5.4 Commit checkpoint: "Add the indexing screen"
- [x] 5.5 Add the pace and remaining-time function (needs 8 chunks, skips the first batch, rounds as designed) and the duration formatting in English and French, and verify table-driven tests cover too early, the rounding bands, a resumed run, a stalled pace and both languages
- [x] 5.6 Give the controller an injected clock, keep the estimate on the running state, and show it on the indexing screen with the honest one-time note and the "working out how long" line in both languages, and verify controller and component tests cover no estimate before 8 chunks, an estimate after, hours, under a minute and French
- [x] 5.7 Commit checkpoint: "Tell the reader how long indexing will take"

## 6. End to end

- [x] 6.1 Add `/api/embed` to the Playwright Ollama mock with the same switches and verify a Playwright test imports a book, sees progress, and reaches "Book added" once indexed
- [x] 6.2 Add Playwright tests for resume after a reload (only missing chapters requested), a rebuild after swapping the embedding model, failure then retry, and an already imported unindexed book indexing at start, and verify they pass together with the existing suite
- [x] 6.3 Commit checkpoint: "Add indexing end-to-end tests"

## 7. Real-world checks

- [x] 7.1 With the user's approval to start their Ollama, add `real-index.manual.test.ts` (skipped unless an environment variable is set), run it against the real `bge-m3` and the real Pride and Prejudice, and record the timing, the vector length and the integrity result (opening sentence of sampled chunks finds its own chunk in the top 3)
- [x] 7.2 Fix what the first real run found: with about 21 seconds per chunk on the user's busy laptop, a flat two-minute request limit falsely reported "Ollama stopped" and 16-chunk requests left the bar still for about 6 minutes, so requests hold 4 chunks and the limit grows with the number of texts, and verify the unit tests cover the new limits
- [x] 7.3 Drive the running app in the browser against the real Ollama: import the real book, watch real progress, reload part way and confirm it resumes, swap the embedding model name and confirm the rebuild, then stop the server and record the result
- [x] 7.4 Show finer progress as the user asked: one chunk per request, a percentage with two decimals (rounded down) next to the chapter, and a small activity animation that stops for reduced motion, and verify unit, component and end-to-end tests cover the percentage moving per chunk, never showing 100.00% early, both languages and the animation being hidden from assistive technology
- [ ] 7.5 With the user, run `pnpm tauri dev` and confirm in the real window that indexing shows, that closing part way and reopening resumes, and that a book imported before this change is indexed at start; record the result
- [ ] 7.6 Ask the user to skim the new French text and record any corrections
- [ ] 7.7 Commit checkpoint: "Record real-world indexing checks"

## 8. Wrap-up

- [ ] 8.1 Update the README status, verify `pnpm check` passes end to end, and verify `openspec validate book-indexing --strict` passes
- [ ] 8.2 With the user's approval to push, verify CI is green on the pushed branch
- [ ] 8.3 Commit checkpoint: "Finish book-indexing", then archive the change
