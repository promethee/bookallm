# Proposal

## Why

A real Verify mode run (`llama3.1:8b` on a GPU, *Candide*, 12 attempts; see the archived `verify-mode-screen` design, "Real-world check (2026-09-27)") showed that the screen works but the claims behind it often do not:

- 6 of 12 attempts ended "a fair claim could not be made" and 1 more failed on an unreadable model reply, so the reader got nothing more than half the time.
- One changed claim swapped "company of foot" for "company of horse", an archaic word-level detail rather than something that matters to the story, and the reveal named it "the order of events", which is false.
- One claim came from the translator's Introduction, not the story.

A study tool whose reveal can be wrong, or that tests the reader on the wrong text, teaches the opposite of what it is for. The earlier note that "true claims skip verification" and so skew the split is not what the code does: the true/false choice is made only after a changed claim is confirmed, so every offered claim, true or changed, has passed the same check. The 4 true vs 1 changed was chance. The split stays fair as long as a failed changed claim never falls back to showing the true one, which this change makes explicit.

## What Changes

- **The system picks the kind of detail first, not the model.** Before extraction, the code picks one of the four kinds (cause, order of events, who, where). Extraction asks for a claim of that kind (for order: two events in sequence), or `NONE` when the passage has none, in which case the next kind is tried. The model never labels its own change, so the label cannot be wrong or unreadable (`ATTRIBUTE: age`).
- **The change must be to that kind and matter to what happens**, not a word choice or minor detail. The code compares the true and changed wording word by word, and rejects a change that alters nothing or rewrites too much.
- **The reveal shows exactly what was changed:** "The book says: {true claim}" and the changed words ("**Cunégonde** → **Paquette**"), alongside the kind and the passage as today.
- **Fewer failures reach the reader:** an unreadable or rejected reply is retried instead of ending the attempt; each retry tells the model why the previous version was rejected; after the retries on one passage run out, the whole pipeline is tried once more on a fresh passage before reporting a failure.
- **Stricter verification reading:** only a reply that starts with the contradiction word counts as confirmed. Today a reply like "The claim does not contradict the passage" counts as confirmed, which lets a still-true "changed" claim through as false.
- **Verify skips front and back matter** (introduction, preface, contents, notes, licence, Project Gutenberg boilerplate) when picking a passage, falling back to every passage only when the book has nothing else. Ask mode is unchanged.
- **Measured tuning:** the manual real-claim test keeps going after failures, prints a per-step trace and a tally, and is run before and after the change. `MUTATION_VERIFY_RETRIES` is set from the "after" tally instead of the provisional guess.

### Non-goals

- Adaptive difficulty, or letting the reader pick a kind.
- Changing the true/false choice (still an unpredictable 50/50, made only after a changed claim is confirmed).
- A fifth kind of change (`what`, number, detail).
- Marking front matter at import time (would need a re-import or a storage migration); the filter works on the chapters already stored.
- The chapter title showing twice under "From the book" (cosmetic, Project Gutenberg passages start with their own title).
- A different chat model or model-specific prompts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claim-mutation`: front and back matter skipped when picking a chunk; the kind is chosen by the system before extraction; the change is checked to be small and is retried with feedback (unreadable answers included); one fresh-passage attempt before failing; stricter confirmation; the result carries the true claim and the changed words; a failed changed claim never falls back to the true one.
- `verify-session`: the reveal of a false claim shows what the book says and the exact words that were changed, besides the kind.

## Impact

- `src/lib/mutation/`: `select.ts` (front/back-matter filter), `defaults.ts` (new prompts, kinds, diff limits, restart constant), `extract.ts` (claim of a given kind or `NONE`), `mutate.ts` (no attribute label; kind given by caller; feedback on retries), new `diff.ts` (word-level comparison), `verify.ts` (first-word parsing), `generate.ts` (orchestration, fresh-passage attempt, optional step trace), `types.ts` (`trueClaim`, `changes`), `real-claim.manual.test.ts` (tally and trace), with their unit tests.
- `src/components/VerifySession.svelte` and `src/lib/i18n/messages.ts`: reveal shows the true claim and changed words; new English and French messages.
- `src/lib/ollama/testing/simulated-ollama.ts` and `e2e/verify-mode.spec.ts`: follow the new prompts and reveal.
- README Verify section and Status: reveal now shows the changed words.
- No new dependencies, no storage or schema change, no new Ollama endpoint. Worst-case time per claim roughly doubles when the fresh-passage attempt runs (a few seconds on a GPU, minutes on CPU-only machines).
