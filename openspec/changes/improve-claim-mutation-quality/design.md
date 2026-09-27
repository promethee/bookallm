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

4. **Verification reads the first word only, and keeps its own independent view.** `confirmed` is true only when the reply's first word, letters only and case-insensitive, is `CONTRADICTS`. The prompt keeps the passage and the changed claim only, not the true claim, so the check is not anchored to the change it is judging. The wording may be adjusted (for example a plain "Is this claim true according to the passage? TRUE or FALSE") only if the before/after trace shows the check itself, not the change, is what rejects good changes; any such change keeps first-word parsing. *Update from the baseline (see Real-world check):* the trace shows exactly that (clear swaps such as "old woman" to "young woman" or "Venice" to "Paris" answered `MATCHES`), so the rewording is part of task 3.4, measured in 5.1.

5. **One fresh-passage attempt, in the library, not the controller.** When a chunk yields no claim (decision 1) or no confirmed change within `1 + MUTATION_VERIFY_RETRIES` rounds, `generateClaim` picks a second chunk, excluding the caller's list and the first chunk, and runs the whole pipeline once more (`MUTATION_FRESH_PASSAGE_ATTEMPTS = 1`). Only then does it return `unverified`. `no-chunks-available` for the second pick is not an error: the first chunk's failure is returned. The citation, and therefore the id the controller marks as used, is the chunk the claim came from.
   - *Why:* keeps the "never throws, one call, one result" contract and puts the logic where it is unit-tested; the controller stays as it is.
   - `unverified` keeps its meaning for the reader ("a fair claim could not be made this time") and now also covers "no chunk yielded a claim"; `detail` says which, for diagnostics. No new error code, so no new message.
   - *Cost:* worst case doubles. GPU: a few seconds. CPU-only: many minutes, but the waiting screen and Stop already cover long waits.

6. **Result shape.** `MutationClaim` gains `trueClaim: string` (always) and `changes?: { before: string; after: string }[]` (only when `isTrue` is false, from decision 3). `changedAttribute` stays and is now the code-chosen kind. `difficulty: 'flat'` unchanged. Nothing is stored, so no migration.

7. **Front and back matter filter in `select.ts`, Verify only.** `pickChunk` first builds the eligible pool: chunks whose chapter title does not match a front/back-matter pattern and whose text does not contain `Project Gutenberg`. Title patterns (whole words, case-insensitive, accents ignored), English and French: introduction, preface/préface, foreword, avant-propos, prologue du traducteur, contents/table des matières/sommaire, note(s) (transcriber's, translator's, du traducteur, de l'éditeur), acknowledg(e)ments/remerciements, dedication/dédicace, copyright, licen(c|s)e, colophon, about the author/à propos de l'auteur, bibliography/bibliographie, index, glossary/glossaire, footnotes/notes de bas de page, errata/typographical errors. Chunks shorter than `MIN_CLAIM_CHUNK_LENGTH` (200 characters) are also skipped: in the baseline, title-page sections ("THE MODERN LIBRARY", "CANDIDE BY VOLTAIRE") hold a line or two, too little for a fair claim, and no title pattern can name them. If the pool is empty for the whole book (not just after exclusions), it is all chunks. Exclusions apply after. Constants live in `defaults.ts`.
   - *Why:* works on books already stored, no re-import; `Prologue`, `Epilogue` and `Appendix` are left in, since they are often part of the story.
   - *Considered:* EPUB `epub:type`/landmarks at import (reliable only on well-made EPUBs, and a stored-data change); skipping the first N % of chapters (drops real openings).
   - Fallback only on an empty whole-book pool: falling back after exclusions would serve introduction claims just before the controller's "every passage used, start over" reset.

8. **Optional step trace for measurement.** `GenerateClaimOptions` gains `onStep?: (step: ClaimStep) => void`, called for each pick, extraction, mutation and verification with the chunk id, kind, attempt number, raw model reply, outcome (`claim`, `none`, `rejected: <reason>`, `confirmed`, `not-confirmed`) and milliseconds. The app does not pass it. `real-claim.manual.test.ts` uses it, no longer stops at the first failure, and prints a tally at the end: offered true, offered changed per kind, `unverified`, other failures, confirmations by attempt number, extraction `NONE` per kind, fresh-passage attempts used, and time per claim (median and max). `CLAIM_COUNT` default goes to 20 (about 2 minutes on the GPU machine). The only assertions left are shape checks on successful claims.

9. **`MUTATION_VERIFY_RETRIES` from data.** The "before" run (tasks group 1, trace and tally on today's pipeline) is the baseline. After the change, run 3 × 20 claims on *Candide* and set the constant to the smallest value past which one more round would have confirmed less than 10 % of the claims that were confirmed at all. Recorded in this design with the numbers.

10. **Reveal layout.** Under "This claim was false. What was changed: {kind}." add "The book says: {true claim}" and one line per change: `<before> → <after>`, the book's words struck through or muted and the new words emphasised; an empty side shows "(added)" or "(removed)" instead. New English and French messages: `verify.bookSays`, `verify.changedWords`, and, read by screen readers in place of the arrow, `verify.swapped`, `verify.added`, `verify.removed` (added to the deferred French review memory). The passage block is unchanged.

11. **Only `who` and `where` in v1.1, and a five-word minimum for a true claim.** Decided after the first "after" run (see Real-world check, "After"): with the word-diff check in place, a changed order was accepted 5 times out of 85 and a changed cause 10 out of 70, against 21 of 33 for `who`. The model rewrites the sentence for clause-sized or reordering changes, and the diff (rightly, for cause; wrongly, for a correct swap of two events) rejects it; in practice readers saw almost only `who`/`where` changes anyway, after long retry chains. `CLAIM_KINDS` becomes `['who', 'where']`; the `ChangedAttribute` type, the prompt wording for all four kinds and the four interface strings stay, so the later version adds kinds back without a type or text change. `MIN_CLAIM_WORDS = 5`: a shorter true claim ("He said.", "Candide said that.") is too vague to judge without the passage and is treated as `NONE`, reported as `too-short` in the trace.
    - *Considered:* per-kind diff rules (order compared as a bag of words, cause allowed one large run): about 1.5 hours, but it would accept muddled order claims the trace also showed, and it keeps free rewriting at the root; loosening the limits for every kind: lets real rewrites through; keeping four kinds as is: long retries, order almost never shown.
    - **Changes a core decision** (README promised four kinds); agreed with the user on 2026-09-27.

## Later: cause and order

Not in this change; recorded so the follow-up starts from what was learned.

- **Build claims from extracted parts instead of rewriting.** Order: the model returns the two events as separate fields (`FIRST:` / `THEN:`), and the code writes "E1 before E2" (true) and "E2 before E1" (changed). Cause: the model returns `EFFECT` and `CAUSE`, then one short alternative cause, and the code writes "EFFECT because ALTERNATIVE". The change is confined to its slot by construction, so the diff check becomes unnecessary for these kinds; verification still checks both claims against the passage.
- **Ollama structured outputs** (`format` with a JSON schema, constrained decoding) to make that extraction dependable. Decision 4 of the archived claim-mutation design avoided JSON because small models produced it unreliably; constrained output removes that failure mode. Needs `chat.ts` to pass `format`, and a check of the minimum Ollama version.
- **Replacements from the book itself:** a list of the book's characters and places, so the code chooses a plausible replacement (instead of "the Countess" or "De Soto", seen in the trace). Would also help `who`/`where`.
- **A larger model for the change step only** (`qwen2.5:14b` is installed on the GPU machine): easy to measure, but slower and heavier than the hardware target.
- **Checking the true claim too:** today only the changed claim is verified; a true claim the model got wrong would be offered as true.

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

## Real-world check (2026-09-27): baseline, before any pipeline change

Setup: the manual test from tasks 1.1-1.2 (trace and tally, no behaviour change) against the local Ollama on the GPU machine (RTX 3060 12 GB, `llama3.1:8b`), with *Candide* (Project Gutenberg #19942, EPUB3 with images, downloaded from gutenberg.org). Two runs of 20 attempts each.

| | Run 1 | Run 2 | Total |
| --- | --- | --- | --- |
| Offered true | 6 | 5 | 11 |
| Offered changed | 5 (order 3, who 1, where 1) | 7 (order 3, who 2, where 2) | 12 |
| `unverified` | 8 | 6 | 14 (35 %) |
| Unreadable mutation (`chat-failed`) | 1 | 2 | 3 (7.5 %) |
| Confirmed at mutation attempt 0 / 1 / 2 | 4 / 3 / 4 | 4 / 3 / 5 | 8 / 6 / 9 |
| Verification `MATCHES` (not confirmed) | 37 | 32 | 69 |
| Claims from front or back matter | 1 (Contents) | 4 (Introduction, Transcriber's Note, Footnotes, Gutenberg licence) | 5 of 23 (22 %) |
| Time per attempt, median / max | 4.5 s / 29.6 s (cold load) | 4.7 s / 7.1 s | |

What the trace shows:

- **The check is the main cause of `unverified`.** Many plainly false one-word swaps were answered `MATCHES`: "The young woman showed Candide a suit of clothes" (the book: the old woman), "Candide is going to Paris to await Cunegonde" (the book: Venice), "Cacambo's name was cut on the trees" (the book: Cunegonde's). The rest were weak changes that add an unsupported detail rather than contradict one ("hanging in the garden", "in his palace"), which `MATCHES` fairly rejects.
- **Model labels are often wrong:** "Martin said Candide was a Manichean" and "Candide's dear Cunegonde killed the brother" were both labelled `order` (both are `who`); "The cadi had me whipped before…" was labelled `order` for an added event. Supports decision 1.
- **Unreadable replies** came as `WHERE: <claim>` followed by a second paragraph, or a claim with no attribute line: 3 of 40 attempts ended there, each after earlier rounds had already been used.
- **Retries pay off:** attempt 2 confirmed 9 of the 23 confirmed changes, as many as attempt 0. The third round is not wasted; `MUTATION_VERIFY_RETRIES` should not go below 2 without new data.
- **Front matter is worse than the first run suggested:** 22 % of offered claims, including the licence. The book's table of contents also has title-page sections ("THE MODERN LIBRARY", "OF THE WORLD'S BEST BOOKS", "CANDIDE BY VOLTAIRE"), "FOOTNOTES:" and "Typographical errors corrected in text:" (decision 7 updated).
- The true/changed split was 11 / 12, consistent with a fair coin.
- No verification reply was a negated sentence ("does not contradict"); `llama3.1:8b` answered with one word every time. The first-word parsing (decision 4) still closes the gap for other models.

## Real-world check (2026-09-27): after the change

Same setup as the baseline. The first "after" runs had the GPU shared with another workload at first (every call fell back to the CPU, about 55 s each); they were stopped and re-run once the GPU was free.

### After, four kinds (3 runs of 20)

| | Total (60 attempts) |
| --- | --- |
| Offered true / changed | 26 / 17 |
| `unverified` | 17 (28 %) |
| Unreadable reply ending the attempt | 0 |
| Claims from front or back matter | 0 of 43 |
| Changes rejected as "changed too much" | 166 (order 80, cause 60, where 14, who 12) |
| Changes accepted by the diff | who 21, where 11, cause 10, order 5 |
| Median time per attempt | 5.4 s |

The verification check, reworded as TRUE/FALSE, now confirmed plainly false swaps ("Cunegonde" to "the old woman", "prevent utter ruin" to "bring about utter ruin") and rejected few changes. The diff check became the bottleneck: correct order swaps ("A before B" to "B before A") look like rewrites word by word, and changed causes were usually whole new clauses. This led to decision 11.

### After, two kinds (`who`, `where`; five-word minimum)

| | 2 runs of 20, 2 retries | 20 claims, 1 retry | French *Candide*, 20 claims, 1 retry |
| --- | --- | --- | --- |
| Offered true / changed | 19 / 18 | 5 / 12 | 9 / 11 |
| `unverified` | 3 (7.5 %) | 3 (15 %) | 0 |
| Confirmed at attempt 0 / 1 / 2 | 29 / 7 / 1 | 14 / 3 / - | 17 / 3 / - |
| Fresh-passage attempts | 11 | 7 | 5 |
| Claims from front or back matter | 0 | 0 | 0 |
| Median time per attempt | 2.5 s | 2.9 s | 3.1 s |

- **`MUTATION_VERIFY_RETRIES` set to 1** (decision 9): the third round confirmed 1 of 37 changes. With 1 retry, 3 of 40 attempts failed across the English and French runs, the same count as with 2 retries; the samples are small, so this is a direction, not a precise rate.
- **Failures shown to the reader: 42 % before, 7.5 % to 15 % after**, and none from an unreadable reply.
- **Quality by eye:** most changed `who` claims swap in another character of the book ("Columbus" to "Vasco da Gama", "the Pope has delivered Candide out of the galleys"); some true claims are still bland ("Candide was being preached at"), and a `where` claim sometimes changes a person instead ("The narrator was sold to the Sultan of Morocco"). Both are for the later change (extracted parts, replacements from the book).
- **French book, found in passing and out of scope here:** most claims came out in English or mixed ("They aborded the rivage of the Dniepr"), because the prompts are in English and never ask for the passage's language. This predates the change; a follow-up should ask for the claim in the passage's language.
