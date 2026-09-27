# Design

## Context

`generateClaim` (`src/lib/mutation/generate.ts`) today: pick a chunk uniformly at random (`select.ts`), extract one claim of any of the four kinds (`extract.ts`), then up to `1 + MUTATION_VERIFY_RETRIES` (3) rounds of mutate (`mutate.ts`, the model answers `ATTRIBUTE: <kind>` / `CLAIM: <text>`) and verify (`verify.ts`, `/contradict/i` on the reply). An unparseable mutation reply returns `chat-failed` at once, outside the retry loop. The true/false coin flip happens only after a changed claim is confirmed.

The real-world check in the archived `verify-mode-screen` design (GPU, `llama3.1:8b`, *Candide*) gave 50 % `unverified`, one `ATTRIBUTE: age` parse failure, one mislabelled change ("foot" to "horse" labelled "order"), and one claim from the Introduction. The exploration that led to this change also found:

- The "4 true vs 1 changed" split is chance (about 37 % likely for 5 fair flips); the coin flip is already conditioned on a confirmed change.
- `/contradict/i` matches "does not contradict", confirming in the unsafe direction.
- The manual test stops at the first failure, so a 50 % failure rate cuts a 5-claim run to 1 or 2 claims, and it prints only final results, so the cause of `unverified` (bad change, cautious check, or near-identical retries) cannot be told apart.
- Picking the kind only at the mutation step fails when the true claim has no detail of that kind: turning a "because" claim into an order claim gives "because → after", which is neither clearly false nor clearly one change.

`Book` values are stored in the library and read back with `getBook`; chapters carry only `number`, `title` and `text`, no front-matter flag. `VerifySession.svelte` reveals `verify.wasFalse` with `verify.attribute.<kind>`, then the chapter title and passage. `simulated-ollama.ts` answers the three Verify prompts by recognising their first line, for unit and e2e tests.

## Goals / Non-Goals

**Goals:**

- A reveal that cannot misname or misdescribe the change.
- Fewer failures shown to the reader, without ever presenting an unconfirmed change as false.
- Claims about the story, not the edition's apparatus.
- A before/after measurement good enough to tune `MUTATION_VERIFY_RETRIES` and the diff limits.

**Non-Goals:**

- See the proposal. Also: no change to Ask mode, to `ingest`, or to stored data.

## Decisions

1. **The code chooses the kind before extraction; extraction may answer `NONE`.** `generateClaim` shuffles the four kinds with the injected `random`, and tries them in that order on the chunk: `extractionPrompt(passage, kind)` asks for one claim of that kind (for `order`: "two events from the passage and which happened first"), or exactly `NONE` if the passage has none. The first kind that yields a claim is kept for the mutation and the result's `changedAttribute`. All four `NONE` means the chunk yields nothing (see decision 5).
   - *Why:* the label becomes a fact the code knows, not a model output to parse or trust, which removes both the `ATTRIBUTE: age` failure and the mislabel. Extracting for the kind avoids asking for an order change on a cause claim.
   - *Considered:* letting the model pick and label (today: unreliable); a fifth `what` kind (still model-labelled, vaguer); picking the kind only at mutation (the "because → after" problem).
   - *Cost:* up to 3 extra extraction calls on passages with few kinds. Measured in the "after" tally; if extraction `NONE` turns out frequent, the order can be biased towards `who`/`where`, which most passages have.
   - `NONE` is read tolerantly: a reply whose first word (letters only, case-insensitive) is `NONE`, or that is empty.

2. **The mutation prompt names the kind and asks for the changed claim only.** `mutationPrompt(passage, trueClaim, kind, rejected)` asks to change only the `kind` detail, to "something that matters to what happens, not a word choice or a minor detail", keeping everything else, and to answer with the changed claim alone. Reading: strip an optional leading `CLAIM:`, take the first non-empty line. Empty means rejected (`unreadable`). `rejected` is the list of this chunk's earlier rejected versions with their reasons (`still true`, `nothing changed`, `changed too much`, `unreadable`), phrased as "Do not repeat these: …".
   - *Why:* one small job per prompt suits an 8B model; feedback makes retries differ instead of resampling the same prompt.
   - The keyword parser and its unlabelled-first-line fallback in `mutate.ts` are removed; nothing left to parse but the claim.

3. **Word-level diff in code (`src/lib/mutation/diff.ts`), no dependency.** Tokenise both claims on whitespace; compare tokens case-insensitively with surrounding punctuation ignored; longest common subsequence (claims are one sentence, so O(n·m) is trivial); group non-matching tokens into runs. Each run becomes `{ before: string; after: string }` using the original tokens, so either side can be empty (an insertion or a deletion). The mutation is rejected when there are no runs, more than `MUTATION_MAX_CHANGED_RUNS` (2: a swap of two events can touch two places), or when the true claim's changed tokens exceed `MUTATION_MAX_CHANGED_SHARE` (0.5) of its tokens with a floor of 3 tokens. Both limits are provisional, like `MUTATION_VERIFY_RETRIES`, and checked against the "after" trace.
   - *Why:* deterministic, always correct about what changed; doubles as the "exactly one change" check the spec always asked for but nothing enforced.
   - *Considered:* asking the verifier which thing changed (another model guess); a diff library (would need a dependency, not worth it for one sentence).

4. **Verification reads the first word only, and keeps its own independent view.** `confirmed` is true only when the reply's first word, letters only and case-insensitive, is `CONTRADICTS`. The prompt keeps the passage and the changed claim only, not the true claim, so the check is not anchored to the change it is judging. The wording may be adjusted (for example a plain "Is this claim true according to the passage? TRUE or FALSE") only if the before/after trace shows the check itself, not the change, is what rejects good changes; any such change keeps first-word parsing.

5. **One fresh-passage attempt, in the library, not the controller.** When a chunk yields no claim (decision 1) or no confirmed change within `1 + MUTATION_VERIFY_RETRIES` rounds, `generateClaim` picks a second chunk, excluding the caller's list and the first chunk, and runs the whole pipeline once more (`MUTATION_FRESH_PASSAGE_ATTEMPTS = 1`). Only then does it return `unverified`. `no-chunks-available` for the second pick is not an error: the first chunk's failure is returned. The citation, and therefore the id the controller marks as used, is the chunk the claim came from.
   - *Why:* keeps the "never throws, one call, one result" contract and puts the logic where it is unit-tested; the controller stays as it is.
   - `unverified` keeps its meaning for the reader ("a fair claim could not be made this time") and now also covers "no chunk yielded a claim"; `detail` says which, for diagnostics. No new error code, so no new message.
   - *Cost:* worst case doubles. GPU: a few seconds. CPU-only: many minutes, but the waiting screen and Stop already cover long waits.

6. **Result shape.** `MutationClaim` gains `trueClaim: string` (always) and `changes?: { before: string; after: string }[]` (only when `isTrue` is false, from decision 3). `changedAttribute` stays and is now the code-chosen kind. `difficulty: 'flat'` unchanged. Nothing is stored, so no migration.

7. **Front and back matter filter in `select.ts`, Verify only.** `pickChunk` first builds the eligible pool: chunks whose chapter title does not match a front/back-matter pattern and whose text does not contain `Project Gutenberg`. Title patterns (whole words, case-insensitive, accents ignored), English and French: introduction, preface/préface, foreword, avant-propos, prologue du traducteur, contents/table des matières/sommaire, note(s) (transcriber's, translator's, du traducteur, de l'éditeur), acknowledg(e)ments/remerciements, dedication/dédicace, copyright, licen(c|s)e, colophon, about the author/à propos de l'auteur, bibliography/bibliographie, index, glossary/glossaire. If the pool is empty for the whole book (not just after exclusions), it is all chunks. Exclusions apply after. Constants live in `defaults.ts`.
   - *Why:* works on books already stored, no re-import; `Prologue`, `Epilogue` and `Appendix` are left in, since they are often part of the story.
   - *Considered:* EPUB `epub:type`/landmarks at import (reliable only on well-made EPUBs, and a stored-data change); skipping the first N % of chapters (drops real openings).
   - Fallback only on an empty whole-book pool: falling back after exclusions would serve introduction claims just before the controller's "every passage used, start over" reset.

8. **Optional step trace for measurement.** `GenerateClaimOptions` gains `onStep?: (step: ClaimStep) => void`, called for each pick, extraction, mutation and verification with the chunk id, kind, attempt number, raw model reply, outcome (`claim`, `none`, `rejected: <reason>`, `confirmed`, `not-confirmed`) and milliseconds. The app does not pass it. `real-claim.manual.test.ts` uses it, no longer stops at the first failure, and prints a tally at the end: offered true, offered changed per kind, `unverified`, other failures, confirmations by attempt number, extraction `NONE` per kind, fresh-passage attempts used, and time per claim (median and max). `CLAIM_COUNT` default goes to 20 (about 2 minutes on the GPU machine). The only assertions left are shape checks on successful claims.

9. **`MUTATION_VERIFY_RETRIES` from data.** The "before" run (tasks group 1, trace and tally on today's pipeline) is the baseline. After the change, run 3 × 20 claims on *Candide* and set the constant to the smallest value past which one more round would have confirmed less than 10 % of the claims that were confirmed at all. Recorded in this design with the numbers.

10. **Reveal layout.** Under "This claim was false. What was changed: {kind}." add "The book says: {true claim}" and one line per change: `<before> → <after>`, the book's words struck through or muted and the new words emphasised; an empty side shows "(added)" or "(removed)" instead. New English and French messages: `verify.bookSays`, `verify.changed`, `verify.added`, `verify.removed` (names final in implementation; added to the deferred French review memory). The passage block is unchanged.

## Risks / Trade-offs

- [More model calls per claim: up to 4 extractions, 3 mutate/verify rounds, times 2 passages] → Each call is short. The trace measures the real distribution; if it hurts, bias the kind order (decision 1) or lower the retries (decision 9).
- [The diff rejects a good change that is phrased differently (the model rewrites the sentence around the swap)] → Rejection feeds back "changed too much, keep the rest word for word"; limits are provisional and tuned from the trace.
- [Title patterns miss a front-matter chapter or catch a story chapter titled "Notes from Underground"] → Whole-word patterns on the chapter title only; checked against *Candide* and one French book in the real-world run. A miss degrades to today's behaviour, not to a wrong claim.
- [Stricter first-word parsing rejects "Contradicts." with leading text like "Answer: CONTRADICTS"] → Letters-only first word; a leading `Answer:` label is stripped before reading. Unsafe direction is the one that matters: a missed confirmation costs a retry, a false confirmation shows a true claim as false.
- [Fresh-passage attempt hides a systematic problem behind longer waits] → The trace and tally record every fresh-passage attempt, so the rate stays visible.
- [Showing the true claim makes the reveal card longer] → One short sentence plus one line per change (at most two); the passage block was already the longest part.

## Migration Plan

No stored data changes. Rollback is reverting the change.

## Open Questions

None blocking. The exact prompt wording and the two diff limits are tuned during the real-world tasks, the same way earlier prompts in this project were.
