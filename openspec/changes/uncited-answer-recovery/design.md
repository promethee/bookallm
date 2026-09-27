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

## Real-world check (2026-09-27)

Run in the real app (`pnpm dev` on port 5287, in the browser pane) against the
local Ollama on the GPU machine (`llama3.1:8b`, `bge-m3`), with the same indexed
_Candide_ (Project Gutenberg #19942) as the `chapter-hint-recovery` check. Times
run from submitting the message, or clicking "Look in this chapter", to the turn
finishing.

<!-- markdownlint-disable MD013 -->

| #   | Question                                            | Answer                           | Offer | Recovery                       | Retry result                 | Time           |
| --- | --------------------------------------------------- | -------------------------------- | ----- | ------------------------------ | ---------------------------- | -------------- |
| 1   | What was the name of Pangloss's dog?                | "No mention of a dog", no marker | Yes   | List: HOW CANDIDE FOUND…       | Uncited, chapter handed over | 27.9 s + 1.9 s |
| 2   | What did Cunegonde eat for breakfast at the castle? | "No mention…", no citation       | Yes   | List: HOW CANDIDE WAS BROUGHT… | Uncited, chapter handed over | 4.6 s + 1.5 s  |
| 3   | How many children did Cacambo have?                 | "No mention…", no citation       | Yes   | Typed "try chapter 5"          | Uncited, chapter handed over | 4.4 s + 1.8 s  |
| 4   | What happened to Candide and Pangloss in Lisbon?    | Cited                            | No    | –                              | –                            | 3.0 s          |
| 5   | Why was Candide expelled from the castle?           | Cited                            | No    | –                              | –                            | 1.5 s          |
| 6   | Que trouve-t-on dans les rues d'Eldorado ?          | A real answer, with no citation  | Yes   | List: ARRIVAL OF CANDIDE…      | Cited answer                 | 3.4 s + 2.4 s  |
| 7   | sheep?                                              | Cited                            | No    | –                              | –                            | 2.1 s          |

<!-- markdownlint-enable MD013 -->

- **The dead end is gone.** All three on-topic questions the book does not
  answer (1–3) now end with the "cites no passage" line and the chapter list,
  where before they ended with the model's text alone. Each chapter retry handed
  the chapter over, which is right: the book does not say.
- **No offer on cited answers.** The three answers that cited passages (4, 5, 7)
  showed no line and no list.
- **Forgot-to-cite answers are caught and recovered.** Question 6 was cited in
  the `chapter-hint-recovery` check, but this time the model answered in French
  without any marker. It got the offer; the retry in the Eldorado chapter came
  back with a citation to the passage about the red sheep drawing carriages.
  This is the risk listed above, playing out as intended: the reader ends with a
  checkable answer.
- **Question 1 had no `[None]` marker this run**, unlike the earlier check; both
  forms are covered by the "no resolved citation" rule.
- **Typed hint after an uncited answer** ("try chapter 5") followed the
  heading-only "V" entry to its chapter, as after a nothing-found turn.
- **Times:** the first question took 27.9 s because the chat model loaded cold;
  after that, whole-book answers took 1.5–4.6 s and chapter retries 1.5–2.4 s.
- **Of 4 recoveries, 1 answered with citations and 3 handed the chapter over.**

## Migration Plan

No stored data changes. Turns are in memory only. Rollback is reverting the
change.

## Open Questions

None. Wording and typed-hint behaviour were decided with the user on 2026-09-27:
the short "cites no passage" line above the existing offer, and typed hints
after an uncited answer work as after a nothing-found turn.
