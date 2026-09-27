# Tasks

## 1. Controller

- [x] 1.1 Add `deleteState`, `bookNotice` (cleared in `resetBookSession`) and `deleteActiveBook()` per design decisions 1 and 2; verify with a new `controller.delete.test.ts`: record, book and vectors of every model gone from the library; the most recent remaining book becomes active with the notice; with none left the screen is the import screen; an unfinished index for the next book starts indexing
- [x] 1.2 Stop and clear what belonged to the deleted book (abort answer, claim and indexing; conversation, claim and tally cleared); verify with delete controller tests for a pending answer and a claim being generated
- [x] 1.3 Handle failure (design decision 4) and announce success and failure; verify with delete controller tests where the library's `remove` rejects (book, index and turns unchanged, `deleteState` failed, retry succeeds) and on the announcer
- [x] 1.4 Run `pnpm exec vitest run src/lib` and `pnpm lint`, then commit ("Add deleting the active book to the controller")

## 2. Interface

- [x] 2.1 Add the English and French messages from design decision 5; verify with the existing i18n key-parity test
- [x] 2.2 Add the delete action, inline confirmation, failure line and "now showing" line to the landing screen's book card (design decisions 1 to 4); verify with a new `delete-book.test.ts` component test: confirmation text, Cancel changes nothing, Delete deletes, notice shown, failure message with retry
- [x] 2.3 Verify keyboard focus and French: component tests that Cancel is focused on open, focus returns to the action on cancel and moves to the notice after a deletion, and one full flow in French
- [x] 2.4 Run `pnpm exec vitest run` and `pnpm lint`, then commit ("Add deleting the active book to the landing screen")

## 3. End to end

- [x] 3.1 Add `e2e/delete-book.spec.ts`: import two books, delete the active one and land on the other with the notice; delete the last one and land on "Add a book"; re-import the deleted file and see it indexed as a new book; keyboard-only run; verify with `pnpm exec playwright test`
- [x] 3.2 Commit ("Add book deletion e2e tests")

## 4. Real-world check and wrap-up

- [x] 4.1 In the real app (`pnpm dev`, local Ollama) with the real *Candide* imported and indexed, delete it and record in this change's design.md: time taken, the screen shown after, and that the browser's IndexedDB has no book, registry entry or vectors left for it (checked in the page); verify the notes are written
- [x] 4.2 Update the README Status section to say the active book can be deleted; verify with markdownlint
- [x] 4.3 Add the new French messages to the deferred French review memory file (`french-indexing-text-review-deferred.md`), then commit ("Finish delete-active-book")
