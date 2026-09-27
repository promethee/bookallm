# Proposal

## Why

Retrieval recovery starts only after a whole-book search returns
`nothing-relevant`. The real-world check of `chapter-hint-recovery` (2026-09-27,
Gutenberg _Candide_, `bge-m3`) showed this is rare for questions about the book.
Every on-topic question cleared the relevance cutoff, including ones the book
does not answer. For "What was the name of Pangloss's dog?" the model replied
"There is no mention of a dog in any of the passages provided[None]": no
resolved citation, and no way forward for the reader. The app's premise is that
an uncited claim cannot be checked, so such an answer is as much a dead end as
"nothing found". The recovery flow already exists and should be offered here
too.

## What Changes

- A finished whole-book question turn whose answer has no resolved citation can
  be recovered, like a nothing-found turn. That covers answers whose markers did
  not resolve ("[None]") and answers with no markers at all.
- The model's own text stays as it is. Under it, the turn shows a short app line
  explaining why the offer is there ("This answer cites no passage, so it can’t
  be checked."), then the existing chapter offer ("Or choose where to look:",
  the chapter list, "Look in this chapter").
- Right after such a turn, a typed "chapter N" message is a chapter hint for its
  question, exactly as after a nothing-found turn. That includes the "couldn't
  tell which chapter" reply and a second typed try.
- Everything else about recovery is unchanged: one chapter-restricted retry per
  question, hand-over of the chapter text if that retry cites nothing, stop,
  failure and busy behaviour, keyboard and announcements.
- Turns that were stopped, failed, or are themselves chapter retries are never
  recoverable (unchanged).
- English and French for the new line.
- Real-world check against the same book and models, including the dog question.

### Non-goals

- Changing the relevance cutoff, the passage count or the answer prompt.
- Detecting "the book doesn't say" from the model's wording. Only the citation
  count is used.
- Recovering an answer that cites some passages but not others, or cites
  passages that do not support it. One resolved citation is enough to count as
  answered.
- Hiding or rewriting the model's text, or its unresolved markers such as
  "[None]".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `retrieval-recovery`: the chapter offer, typed hints and the single retry
  apply to any recoverable turn: a whole-book question that found nothing
  relevant, or whose finished answer has no resolved citation. Introduced by
  `chapter-hint-recovery`, which must be archived before this change.
- `ask-conversation`: a finished answer without a resolved citation is followed
  by the "cites no passage" line and the chapter offer, and a chapter-naming
  message right after it is a chapter hint.

## Impact

- `src/lib/onboarding/controller.svelte.ts`: `canRecover` accepts any finished,
  not-stopped, not-recovered `question` turn with no citations, whatever its
  verdict. The chapter choices are loaded for any whole-book question, not
  only a nothing-found one. `retryInChapter` and the typed-hint routing in
  `askQuestion` follow `canRecover` unchanged.
- `src/components/AskConversation.svelte`: the "cites no passage" line above the
  offer on uncited turns.
- `src/lib/i18n/messages.ts`: one new key (`recovery.uncited`) in English and
  French.
- Tests: controller recovery tests, component tests, and an e2e case with a
  mocked uncited answer.
- No new dependencies, no storage or schema change, no new Ollama endpoint.
