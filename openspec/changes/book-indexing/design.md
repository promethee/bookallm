# Design

## Context

Books are saved in IndexedDB (`books` and `registry` stores, database `bookallm`, version 1) with their chapters and chunks. A chunk has a stable id (`<hash prefix>:<chapter>:<position>`) and a locator; chunks are at most 1,600 characters. The onboarding controller picks the screen with a pure `decideScreen` from real state and keeps no "setup finished" flag. Ollama is reached through one `OllamaClient` (`request(path, init)`), and a simulated Ollama exists for unit tests, plus request interception for Playwright. The active book is `settings.activeBook` or the most recently imported one. See proposal.md for motivation and scope.

## Goals / Non-Goals

**Goals:**

- One pure, testable indexer that can be interrupted at any point and resumed without redoing saved work.
- "Is this book indexed for this model?" always answered from what is really stored, never from a flag, like the rest of the first-run flow.
- The same in-memory and IndexedDB behaviour, proven by one shared contract test suite.

**Non-Goals:**

- Reading vectors back for search (Ask mode's retrieval change will add the read path and the similarity maths). Only the minimum read needed to prove storage is included.
- Concurrency, workers, or speed tuning before a real measurement says it is needed.
- Any change to how books are chunked.

## Decisions

1. **New module `src/lib/indexing/`, no UI code in it.** `embed.ts` (the Ollama call), `indexer.ts` (the loop), `status.ts` (what is saved versus what is needed), `types.ts`. The controller and screen only consume it. Same shape as `ingest` and `ollama`.

2. **Embedding call.** `POST /api/embed` with `{ model, input: string[] }`, answered by `{ embeddings: number[][] }`. Chunks go 4 per request, one request at a time (a named constant). The real check showed that embedding time grows in step with the number of texts (a busy laptop without a graphics card took about 21 seconds per chunk, 16 chunks took almost 6 minutes), so a bigger batch is not faster and only makes progress move less often; the original 16 would have looked frozen. A request that gets no answer within two minutes plus a minute per text counts as unreachable, because a flat limit called a slow but working Ollama "stopped". Failures are typed: connection errors and timeouts are `unreachable`; HTTP 404 or a "not found" message is `model-not-found`; any other error keeps Ollama's message as `embed-failed`. The response is validated before use (count, non-empty, all finite numbers, one length). _Alternative: `/api/embeddings` (one text per call), rejected: older and slower._

3. **Vector store contract, two implementations.** `VectorStore`: `savedChapters(hash, model)`, `loadChapter(hash, model, chapter)`, `saveChapter(record)`, `discard(hash, model)`, `discardOtherModels(hash, keepModel)`, `modelsWithVectors(hash)`. A record holds `{ hash, model, chapter, dimension, chunkIds, vectors }`, with all of a chapter's vectors in one `Float32Array` (chunk count times dimension). One record per chapter makes "a chapter is saved together or not at all" one write, and resuming means listing which chapter numbers exist. `BookLibrary` gains `vectors: VectorStore`. `MemoryLibrary` gets an in-memory twin (used when storage is blocked, and by tests). Both run one contract test suite, as `Registry` already does. _Alternative: one record per chunk, rejected: hundreds of small writes with no atomic chapter unit. Alternative: one record per book, rejected: rewriting megabytes after every chapter._

4. **IndexedDB version 2.** `upgrade(db, oldVersion)` creates a `vectors` store with key path `[hash, model, chapter]` when `oldVersion < 2` (no extra index: the leading part of the compound key already gives every record of one book, or of one book and model, as a key range), and touches nothing else, so saved books survive. Removing a book deletes its `registry`, `books` and all `vectors` records in one transaction. Downgrading is not supported (an older build would refuse to open a version 2 database), which is acceptable before a first release.

5. **"Indexed" is computed, never stored.** `indexStatus(book, model, store)` compares the chapter numbers that own chunks with the saved chapter numbers for the normalised model name, and returns `complete`, `partial` (with done and total) or `none`, plus whether vectors of another model exist (which makes it a rebuild). No status flag can drift from the vectors. Model names go through `normalizeModelName`, so `bge-m3` and `bge-m3:latest` match. The book is loaded once at start and after a change; a few MB read from IndexedDB is fine.

6. **The indexer.** `indexBook({ book, model, client, store, signal, onProgress })` returns `complete`, `aborted` or `failed` with a typed error and never throws for an expected outcome. It groups chunks by chapter, skips saved chapters, embeds the rest batch by batch (checking the signal between requests), validates each answer, saves each chapter, and reports progress after every batch. If a new dimension differs from what is saved for the same model name, it discards that model's saved vectors and starts over (the model behind a tag was replaced). Only when every chapter is saved does it delete the vectors of other models, so an interrupted rebuild keeps the old index. A `StorageFullError` from the store becomes `storage-full`.

7. **Progress numbers.** "Chapter k of n" counts chapters that have chunks, including those already saved, so a resume starts at the saved count; a chapter without text is not counted. The bar uses chunks embedded over total chunks, so a chapter of 5 chunks does not move it as far as one of 50.

8. **Screen and controller.** `decideScreen` gains an input `index: 'unknown' | 'ready' | 'needed'` and a screen `index-book`. When Ollama is ready, `unknown` gives the checking screen, `needed` gives `index-book` (ahead of import and landing), and `ready` continues as before. `ready` is also the answer when there is no active book or its content cannot be found. The controller computes the status after a readiness check, after a book is saved or recognised, and after the model names change, and starts the indexer whenever the screen is `index-book` and no run is active. On success it announces and recomputes, so the flow moves on by itself: after an import `importRequested` is still set, so the "Book added" summary appears next; otherwise the landing screen. A failure keeps the screen and shows a message and retry. Retry runs the readiness check first, so a stopped Ollama goes to the get-Ollama screen and indexing resumes by itself afterwards. `destroy()` aborts a running index.

9. **Reuse over new patterns.** The screen follows the model download screen: `<progress>` with value, min and max, a status paragraph, an error block with a details section for the "other" failure, the shared `Button` and `Heading`, focus on the heading, live-region announcements. Messages go in both language tables, and the existing parity test covers them.

10. **Tests and fakes.** The simulated Ollama and the Playwright mock gain a deterministic `/api/embed` (a small vector derived from each text's words, so equal texts give equal vectors) with switches for a wrong count, a dropped connection after N requests, a missing model and a stall. Unit tests cover the embedding call, the indexer (resume, abort, model swap, dimension change, every failure), the status table, the store contract on memory and on `fake-indexeddb`, `decideScreen` as a table and the controller with fake services. Component tests render the screen in both languages. Playwright covers import to "Book added", resume after a reload (asserting only missing chapters are requested), a rebuild after a model swap, and failure then retry. A manual, environment-guarded test (`real-index.manual.test.ts`) indexes the real Pride and Prejudice with the real `bge-m3` and checks the integrity proxy (the opening sentence of sampled chunks finds its own chunk in the top 3), with its similarity maths kept inside the test file.

## Risks / Trade-offs

- [The first request is slow because Ollama loads `bge-m3` into memory] → The screen shows 0 of n and the one-time note from the start, and the real-world check measures it. If it looks frozen, add a "waking up the model" line.
- [Indexing time on a slow machine is unknown] → Measured in the real-world checks with the real book. Progress is saved per chapter, and closing the app is safe.
- [A rebuild starts without asking after a model swap] → The screen explains it. Asking first and keeping one index per model are recorded as future versions below.
- [A tag such as `bge-m3:latest` can be silently replaced by a different model] → A vector length mismatch against saved vectors discards the stale index and starts again.
- [Two indexes of one book exist during a rebuild] → About 3 to 4 MB of extra space for a novel; the old one is deleted the moment the new one completes.
- [Vectors are text-derived and live in the browser's storage, which some webviews may evict] → The same "ask for persistent storage" request already covers all of the app's data, and losing an index only costs a re-run of indexing.
- [Indexing on the main thread while the screen updates] → Every step awaits network or IndexedDB, so the page stays responsive. Move to a worker only if a real run shows jank.
- [Chapters with no chunks make "chapter k of n" skip numbers] → Counting only chapters that have text is the honest version, and it is stated in the spec.
- [The README lists SQLite plus a vector extension or flat files as options] → IndexedDB records with one `Float32Array` per chapter are the flat-file option in the store the app already uses. Moving to SQLite later means implementing the same `VectorStore` contract.

## Migration Plan

Existing installs upgrade the database from version 1 to 2 on first launch: books and registry entries stay, and each book counts as not indexed, so the indexing screen appears once for the active book. Other books are indexed when they become active. There is no rollback path for the database version, which is acceptable for a pre-release app whose only data is re-importable EPUBs.

## Future Versions

Kept from the decision on a changed embedding model, not built now:

- Ask before rebuilding, offering "keep the old models" as a way out.
- Keep one index per embedding model side by side, with removal of a book removing all of them.

## Open Questions

- Whether "a few minutes" in the one-time note should be replaced by an estimate once real timings are known (answerable after the real-world check, without changing behaviour).

## Real-world results (the user's machine, real Ollama 0.34.0, real `bge-m3`)

- Machine: a 4-thread laptop CPU (Ryzen 3 3200U), no graphics acceleration for the model (Ollama reported no VRAM use). During the runs the CPU was at 100% because of three unrelated `conhost` processes, so these timings are pessimistic.
- Loading the model on the first request took about 16 seconds.
- Speed: about 21 seconds for one 944-character chunk, and it grew in step with the batch (4 chunks 86 s, 16 chunks 355 s), so batching does not help. A 38-chunk run took 1,159 seconds (about 30 seconds a chunk). All of Pride and Prejudice (657 chunks, 64 chapters) would take roughly 4 to 5 hours here.
- Correctness: all 38 chunks got one vector each, 1,024 numbers long. The integrity proxy found 34 of 34 sampled chunks by their opening sentence in the top 3 (31 as the top result).
- Found and fixed: a flat two-minute request limit falsely reported "Ollama stopped" (16 chunks take about 6 minutes here) and 16-chunk requests left the progress bar still for that long. Requests now hold 4 chunks and the limit grows with the number of texts.
- Found and not yet resolved: the screen says indexing "can take a few minutes for a long book", which is false on a slow computer. This changes the indexing screen's promise, so it needs a decision from the user.
