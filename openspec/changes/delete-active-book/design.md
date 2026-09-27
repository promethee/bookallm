# Design

## Context

- `BookLibrary.registry.remove(hash)` (IndexedDB) already deletes the registry record, the stored book and every vector of that book (all models) in one transaction; `MemoryLibrary` mirrors it for tests. `local-persistence` specifies this. Nothing calls it yet.
- `OnboardingController.activeBook` is derived: the book saved as `settings.activeBook` if it still exists, otherwise the most recently imported (`books.at(-1)`). The screen comes from `decideScreen`, which shows the import screen when there are no books and the indexing screen when the active book's index is unfinished.
- After an import, the controller runs `resetBookSession()` (clears turns, chapter choices, claim, tally, used chunks, aborting a claim), then `ensureIndexNeed()` and `syncIndexing()`. Deletion needs the same sequence for the book that becomes active.
- Running work tied to the active book: `askAbort` (an answer), `verifyAbort` (a claim), `indexAbort` (indexing, which only runs while the indexing screen is shown, so not while the card is visible, but it is aborted anyway for safety).
- `Heading.svelte` focuses the new screen's heading on mount, so moving to the import screen handles focus by itself; staying on the landing screen does not.

## Goals / Non-Goals

**Goals:**

- One controller action, tested with the shared harness like the other flows; the confirmation is purely presentational.

**Non-Goals:**

- Any change to the storage layer or its schema.

## Decisions

### 1. `deleteActiveBook()` in the controller, confirmation state in the component

The controller exposes `deleteActiveBook(): Promise<void>` and `deleteState: 'idle' | 'deleting' | 'failed'`. The action:

1. Does nothing without an active book or while already deleting.
2. Aborts `askAbort`, `verifyAbort` and `indexAbort`.
3. Awaits `library.registry.remove(hash)`. On a rejection it sets `failed`, announces the failure and returns; nothing else has changed.
4. Reloads `books`, saves `activeBook` as the most recent remaining book's hash (or clears it), runs `resetBookSession()`, sets the "now showing" notice when a book remains, announces the deletion with the deleted title, then runs `ensureIndexNeed()` and `syncIndexing()`.

Whether the confirmation is open is local to the card component: it is UI state, lost on reload by design, and keeping it out of the controller keeps the controller's state meaningful.

Alternative: a confirm step in the controller (`requestDelete` / `cancelDelete`). Rejected: it only mirrors a toggle the component can own, and every test would have to step through it.

### 2. The "now showing" notice

`bookNotice: { title: string } | undefined` on the controller, set after a deletion when a book remains and cleared by `resetBookSession()`, so the next import or deletion replaces or removes it. The card shows it as one line under the title ("Now showing: Pride and Prejudice"). It names the book that is now active; the deleted title goes in the announcement.

### 3. Focus

- Opening the confirmation focuses its Cancel button: the safe action is the one a stray Enter hits.
- Cancel returns focus to "Delete this book".
- After a deletion that keeps the landing screen, focus moves to the "now showing" line (`tabindex="-1"`), which names the new book; the element that had focus no longer exists.
- After deleting the last book, the import screen's heading takes focus on mount, as for any screen change.

### 4. Failure

`deleteState: 'failed'` keeps the confirmation open with a plain "BookaLLM could not delete this book. Nothing was removed." line in a `role="alert"`, and its Delete action retries. Because `registry.remove` is one transaction, a failure has removed nothing, so the message can say so.

### 5. Messages

New keys in both languages: `delete.action` ("Delete this book"), `delete.confirm` (the disclosure), `delete.yes` ("Delete"), `delete.cancel` ("Cancel"), `delete.failed`, `landing.nowShowing` ("Now showing: {title}"), and announcements `announce.bookDeleted` ("{title} was deleted.") and `announce.deleteFailed`.

## Risks / Trade-offs

- [Deleting the wrong book by accident] → The confirmation names what goes and focuses Cancel first; there is no undo, but re-importing the file restores the book (indexing runs again).
- [The next book appears without the reader having chosen it] → The "now showing" line and the announcement make the switch explicit.
- [A long IndexedDB transaction on a big book] → Removal of a few thousand vector records is one transaction and takes well under a second; the Delete button shows busy meanwhile.

## Migration Plan

No stored data format changes. Rollback is reverting the change; books deleted meanwhile stay deleted.
