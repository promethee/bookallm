# Proposal

## Why

Every import keeps the book's text and its index on this computer, and nothing can remove them: a book imported by mistake, or no longer studied, stays forever. The README makes deleting a book part of v1 ("removes its index but never the user's original EPUB file, disclosed at delete time"), and the storage layer can already remove a book in one step; the reader just has no way to ask for it.

## What Changes

- The active book's card gets a "Delete this book" action. Choosing it turns the card into an inline confirmation that says plainly what is removed and what is not ("This removes BookaLLM's copy of the book and its index. Your EPUB file stays where it is."), with Delete and Cancel.
- Deleting removes the book's record, its stored text and every vector saved for it, in one step, and never touches the reader's file.
- Afterwards, the most recently imported remaining book becomes active, and a line on its card names it ("Now showing: …"); it goes through the usual flow, so an unfinished index resumes. With no book left, the "Add a book" screen appears.
- Anything tied to the deleted book stops and clears: the Ask conversation, a claim being generated, the Verify tally.
- A deletion that fails is reported plainly and leaves the book exactly as it was.
- English and French, keyboard-operable, announced to screen readers.

### Non-goals

- A library list, a book switcher, or deleting a book other than the active one (v2, per the README's single-active-book scope).
- Undo. The confirmation is the safeguard, and re-importing the file rebuilds the book.
- Freeing space for other models' vectors of books that are kept.

## Capabilities

### New Capabilities

- `book-deletion`: deleting the active book from its card: the inline confirmation and its disclosure, what is removed, which book (or screen) comes next, what is stopped and cleared, and failure handling.

### Modified Capabilities

(none: `local-persistence` already requires that removing a book removes its content and vectors and never the original file; this change only exposes that to the reader.)

## Impact

- `src/lib/onboarding/controller.svelte.ts`: a `deleteActiveBook()` action and a notice naming the book that became active.
- `src/components/LandingScreen.svelte`: the delete action and inline confirmation on the book card (possibly in a small `DeleteBook.svelte`).
- `src/lib/i18n/messages.ts`: English and French messages.
- Uses the existing `registry.remove`, which already removes record, text and vectors in one IndexedDB transaction. No schema change, no new dependency.
