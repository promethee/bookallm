# Design

## Context

- `OnboardingController.canRecover(turn)`
  (`src/lib/onboarding/controller.svelte.ts`) is true for a `question` turn with
  `verdict === 'nothing-relevant'`, `state === 'done'`, not `stopped` and not
  `recovered`. The chapter offer in `AskConversation.svelte`, `retryInChapter`
  and the typed-hint routing in `askQuestion` all go through it, so widening it
  widens the whole flow.
- A `nothing-relevant` turn always ends with `citations: []`: `generateAnswer`
  returns the fixed reply and no citations without calling Ollama.
- `runTurn` loads `chapterChoices` (the chapters with text, for the offer) only
  when the verdict is `nothing-relevant`. `activeChapters()` reads them for
  `retryInChapter`.
- Citations are resolved once the stream ends (`generated.citations()`). A
  marker that points at no retrieved passage, such as `[None]`, is dropped, so
  the turn's `citations` holds resolved ones only.
- A stopped turn has `stopped: true`, a failed one `state: 'failed'`, and an
  aborted retrieval ends `stopped`. So among whole-book question turns,
  "finished, not stopped, no citations" covers exactly two cases: nothing found,
  and an uncited answer.
- `chapter-hint-recovery` is complete but not archived, so
  `openspec/specs/retrieval-recovery/` does not exist yet. This change's RENAMED
  and MODIFIED deltas need it.

## Goals / Non-Goals

**Goals:**

- One rule for "recoverable", shared by the controller, the offer and typed
  hints, with no second code path.
- The reader can tell why the offer appears under an answer that looks finished.

**Non-Goals:**

- Any change to retrieval, the cutoff, the prompt or `generateAnswer`.
- Reading meaning from the model's text ("no mention of…"). See proposal
  Non-goals.

## Decisions

### 1. Recoverable = finished whole-book question with no resolved citation

`canRecover` becomes: `kind === 'question'`, `state === 'done'`, not `stopped`,
not `recovered`, and `citations.length === 0`. The verdict check is dropped: a
nothing-found turn always has no citations, so it stays covered, and an uncited
`relevant` answer joins it. That matches decision 3 of `chapter-hint-recovery`,
where a chapter retry that cites nothing counts as "could not answer". Both
rules now read the same way: no resolved citation means no checkable answer.

Alternative: keep the verdict check and add
`|| (verdict === 'relevant' && citations.length === 0)`. Rejected: it adds
nothing, since the two cases are already the same condition, and it would leave
a turn with no verdict (none exists today) in a state no one decided.

### 2. Load the chapter choices for every whole-book question

`runTurn` sets `chapterChoices` whenever a `question` turn's retrieval returns,
not only on `nothing-relevant`. The book is already loaded at that point and
`choicesOf` is a filter over its chapters, so the cost is negligible. It also
means the choices are ready when the answer finishes uncited, without a second
load.

Alternative: load them when the answer finishes with no citation. Rejected: two
load points for one list, for no saving.

### 3. The "cites no passage" line depends on the verdict

`AskConversation.svelte` shows the new line only when
`controller.canRecover(turn) && turn.verdict === 'relevant'`, directly above
`<ChapterOffer>`. A nothing-found turn keeps its fixed reply followed by the
offer, as today. The offer's own label ("Or choose where to look:") is not
changed: after the new line, "Or" reads as the alternative to checking an answer
that cannot be checked.

The line is plain text, like the hand-over message: no error styling, since the
answer did not fail.

### 4. Messages

New key in both languages, following the existing typography (curly apostrophe,
French spacing before the colon):

- `recovery.uncited`: "This answer cites no passage, so it can’t be checked." /
  « Cette réponse ne cite aucun passage : elle ne peut pas être vérifiée. »

It is added to the deferred French review memory, like the other recovery
strings. The finish announcement stays `announce.answerDone`, as for a
nothing-found turn; the line and the offer come next in reading order.

### 5. Typed hints follow `canRecover` unchanged

`askQuestion` already asks `canRecover(last)` (resolving a `hint-unclear` turn
to the turn it belongs to), so typed "chapter N" hints, the unclear reply and
the second typed try work after an uncited answer with no code change there.
Tests cover it.

### 6. Archive order

`chapter-hint-recovery` is archived first (its tasks are all done), creating
`openspec/specs/retrieval-recovery/spec.md`. This change's RENAMED and MODIFIED
deltas then apply to it. `openspec validate --strict` passes today; only the
archive step needs the order.

## Risks / Trade-offs

- [A correct answer the model forgot to cite now gets the offer] → The reader
  sees the "cites no passage" line and can use or ignore the offer. That is the
  app's positioning: an uncited claim cannot be checked. It is the same
  trade-off `chapter-hint-recovery` accepted for retries.
- [A chapter-naming question asked right after an uncited answer ("what happens
  in chapter 3?") becomes a retry] → Same risk and answer as after a
  nothing-found turn: the retry turn's "Looking in …" label makes it visible,
  and the reader can ask again. The user chose one rule for both cases.
- [The model's text contradicts the line, e.g. it says it found nothing] → The
  line is about citations, not about the book, so it never claims the answer is
  absent. Both can stand together.
- [Answers with a citation that does not support the claim still count as
  answered] → Out of scope. The Verify-mode habit and the shown passage text are
  the reader's check there.

## Migration Plan

No stored data changes. Turns are in memory only. Rollback is reverting the
change.

## Open Questions

None. Wording and typed-hint behaviour were decided with the user on 2026-09-27:
the short "cites no passage" line above the existing offer, and typed hints
after an uncited answer work as after a nothing-found turn.
