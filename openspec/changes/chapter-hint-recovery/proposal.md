# Proposal

## Why

When a search finds nothing relevant, Ask mode replies "could you tell me where in the book that comes up?", but the reader has no way to answer: the next message is just a new, unrelated search. The README's retrieval recovery and escalation flow (point to a chapter, retry there once, then hand over the chapter itself) is the last unbuilt piece of v1 Ask mode, and without it that reply is a dead end.

## What Changes

- A "nothing found" turn offers the book’s chapters to choose from (by title, only chapters with text of their own), as a way to answer its own question.
- Right after a "nothing found" turn, a message that names a chapter by number, in digits or Roman numerals ("try chapter 7", "chapitre VII"), is read as that answer, instead of as a new question. The chapter is matched against the chapters' own titles, since the table-of-contents position often differs from the book's numbering; when the match is not unique, the chapter list is offered instead of guessing.
- The retry searches only that chapter: its passages are ranked against the original question and the best few are used even below the usual relevance bar, then answered from with exact citations, like any answer. It is not another search of the whole book.
- One retry only. If the chapter retry's answer cites nothing, the app stops asking: it says plainly that it could not find it there and shows that chapter's full text in the conversation, in a scrollable block the reader can collapse, to scan themselves. No further AI attempt, no new chapter offer for that question.
- The retry turn says what it is doing (`Looking in chapter …: <original question>`), so the reader can tell a hint from a new question.
- English and French for all new text; everything reachable by keyboard and announced like other turns.
- Real-world check against a real book and the real chat model.

### Non-goals

- History trimming and pinning location hints across turns. Questions are single-turn today (no history is sent to the model), so there is nothing to trim or pin yet.
- Understanding hints that are not a chapter number: a chapter title typed out, "near the earthquake", page numbers, or number words ("seven"). The chapter list covers these.
- Using a chapter mentioned in an ordinary question (one not following a "nothing found" turn) to filter the search.
- A separate reading view for the chapter text; it stays inline in the conversation.
- Changing the relevance cutoff or the answer prompt.

## Capabilities

### New Capabilities

- `retrieval-recovery`: what happens after a "nothing found" answer: offering the chapters, recognising a typed chapter reference, the single chapter-restricted retry, and the hand-over of the chapter's text when that retry cannot answer.

### Modified Capabilities

- `passage-retrieval`: a search can be restricted to one chapter, and a restricted search returns that chapter's best passages whatever their score.
- `ask-conversation`: "Nothing relevant is shown like any other answer" changes, since a nothing-found turn now offers the chapter list; a message right after it can be a chapter hint rather than a new question.

## Impact

- `src/lib/retrieval/retrieve.ts`: an optional chapter filter on `retrievePassages` (only that chapter's vectors are loaded and ranked).
- New small module for reading a chapter reference out of a message and matching it to the book's chapters (English and French, digits and Roman numerals), with unit tests.
- `src/lib/onboarding/controller.svelte.ts`: `Turn` gains its verdict and, for a retry, the chapter and the escalated chapter text; new actions to retry a turn in a chosen chapter.
- `src/components/AskConversation.svelte`: chapter list under a nothing-found turn, the "looking in chapter" label, and the collapsible chapter text.
- `src/lib/i18n/messages.ts`: new English and French messages.
- No new dependencies, no storage or schema change, no new Ollama endpoint.
