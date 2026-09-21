# Proposal

## Why

An imported book is saved as text and chunks, but nothing can find a passage in it yet. Ask mode needs every chunk turned into an embedding vector, and indexing takes minutes on a real book, so the reader needs a clear, resumable wait that honestly shows progress. The onboarding change deliberately left the wait screen without per-chapter progress until real indexing exists.

## What Changes

- Embed every chunk of the active book with the configured embedding model (default `bge-m3`) through Ollama, chapter by chapter, and save the vectors on the device.
- Save after each finished chapter. A book counts as indexed only when every chapter that has text has vectors, so an interrupted index resumes where it stopped, at the next launch or on retry, without redoing finished chapters.
- Record which embedding model made an index. When the configured embedding model changes, rebuild the book's index automatically with the new model, and delete the old index only once the new one is complete.
- Add an indexing screen between the model download and the import or landing screens. It shows the book, "chapter 4 of 22" and a progress bar, explains when a rebuild is caused by a model change, and turns failures (Ollama stopped, disk full, other) into a plain message with a retry.
- The import flow now ends with "Book added" only after the book is indexed. Books imported before this change are indexed the next time the app starts.
- Removing a book also removes its vectors. The device's existing library survives the storage upgrade.
- Real-world checks against the reader's Ollama and a real book, including a manual index-integrity check (a chunk's opening sentence should find its own chunk in the top 3).

### Non-goals

- Searching or retrieving passages for a question. That is the retrieval step of Ask mode and belongs to that change (relevance cutoff, number of passages, "nothing found" behaviour).
- Any search box or other new reading UI.
- Indexing books other than the active one, background indexing while the reader does something else, and a "stop for now" button.

### Future versions

These were considered for what happens when the embedding model changes and are kept for later:

- Ask before rebuilding the index, with a way to keep the old models.
- Keep one index per embedding model side by side, so swapping back costs nothing.

## Capabilities

### New Capabilities

- `book-indexing`: embeds a book's chunks through Ollama, stores the vectors per chapter and per model, resumes an interrupted index, rebuilds after a model change, and reports typed failures.
- `indexing-screen`: the screen that shows indexing progress, explains a rebuild, and handles failures and retry in the reader's language.

### Modified Capabilities

- `first-run-flow`: the screen order gains the indexing screen after the model download and before the import or landing screens.
- `book-import`: the import wait state now leads to real per-chapter indexing progress, and the "Book added" summary appears only once the book is indexed.
- `local-persistence`: the library also keeps vectors, removing a book removes them too, and an existing library survives the storage upgrade.

## Impact

- New code in `src/lib/indexing/` (embedding call, indexer, completeness rules), an extended `BookLibrary` and its in-memory twin, an IndexedDB schema upgrade from version 1 to 2, the onboarding controller and `decideScreen`, one new component, and messages in both languages.
- Depends on Ollama's `/api/embed` endpoint, already covered by the minimum supported Ollama version.
- A few MB of vectors for a novel the size of Pride and Prejudice (several hundred chunks of 1,024 numbers each, at 4 bytes per number).
- No new packages.
