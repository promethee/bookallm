# Tasks

## 1. Measure the current pipeline (baseline)

- [ ] 1.1 Add the optional `onStep` trace to `generateClaim` (design decision 8) without changing any other behaviour; verify with a `generate.test.ts` case that a scripted run reports pick, extract, mutate and verify steps in order with their raw replies, and that existing tests pass unchanged
- [ ] 1.2 Rework `real-claim.manual.test.ts`: keep going after failures, print each step's raw reply, print the end tally (design decision 8), default `CLAIM_COUNT` to 20; verify it is still skipped without `OLLAMA_URL`/`EPUB_PATH` (`pnpm test` passes)
- [ ] 1.3 Run it against the local Ollama (`OLLAMA_URL=http://127.0.0.1:11434`, `llama3.1:8b`, GPU machine) with *Candide* (Project Gutenberg #19942) and record the baseline tally in this design under "Real-world check": offered true/changed, `unverified`, parse failures, confirmations by attempt, front-matter claims, time per claim, and which cause of `unverified` dominates (bad change vs cautious check vs near-identical retries); verify the notes are written
- [ ] 1.4 Run `pnpm test` and `pnpm lint`, then commit ("Add claim generation trace and tally")

## 2. Passage selection

- [ ] 2.1 Add the front/back-matter title patterns and the `Project Gutenberg` text check to `defaults.ts`, and the eligible pool with whole-book fallback to `pickChunk` (design decision 7); verify with `select.test.ts` cases: introduction, preface, contents and licence chapters skipped (English and French titles, accents and case ignored), Gutenberg header chunk skipped, "Prologue" and "Notes from Underground"-style story titles kept, all-front-matter book falls back to all chunks, exclusions applied after the fallback, `no-chunks-available` when every eligible chunk is excluded
- [ ] 2.2 Run `pnpm test` and `pnpm lint`, then commit ("Skip front and back matter in claim selection")

## 3. Claim pipeline

- [ ] 3.1 Create `src/lib/mutation/diff.ts` (design decision 3) with `MUTATION_MAX_CHANGED_RUNS` and `MUTATION_MAX_CHANGED_SHARE` in `defaults.ts`; verify with `diff.test.ts`: one-word swap, multi-word swap, insertion and deletion (empty side), punctuation and case ignored, identical claims give no runs, two runs accepted, three rejected, over-share rejected, 3-token floor on short claims
- [ ] 3.2 Change `extractionPrompt`/`extractClaim` to take a kind and read `NONE` (design decision 1); verify with `extract.test.ts`: the prompt names the kind (order asks for two events), a claim is returned, `NONE`, `none.` and empty replies read as none
- [ ] 3.3 Change `mutationPrompt`/`generateMutation` to take the kind and the rejected list, return only the claim, strip an optional `CLAIM:` label, and report `unreadable` instead of `chat-failed` for an empty reply; remove the attribute parser (design decision 2); verify with `mutate.test.ts`: prompt names the kind and lists rejected versions with reasons, labelled and bare replies read, empty reply is `unreadable`
- [ ] 3.4 Make `verifyContradiction` read only the first word, stripping a leading `Answer:` label (design decision 4); verify with new `verify.test.ts` cases: "CONTRADICTS", "Contradicts.", "Answer: CONTRADICTS" confirmed; "The claim does not contradict the passage", "MATCHES", "Not CONTRADICTS" not confirmed
- [ ] 3.5 Rewrite `generateClaim` orchestration (design decisions 1, 2, 5, 6): shuffled kinds with `NONE` fallback, diff check, rejected-list feedback, unreadable replies as retries, one fresh-passage attempt, `trueClaim` and `changes` on the result, coin flip only after confirmation; add `MUTATION_FRESH_PASSAGE_ATTEMPTS` to `defaults.ts` and export new types from `index.ts`; verify with `generate.test.ts` cases: kind order follows `random`, `NONE` moves to the next kind, all `NONE` moves to a fresh passage, rejected change retried with feedback, unreadable reply retried not failed, fresh passage excludes the first chunk and the caller's list, `unverified` only after both passages, no fallback to the true claim, citation is the chunk the claim came from, `changedAttribute` is the chosen kind, `changes` matches the diff, true result has `trueClaim` and no `changes`, abort still ends without an error
- [ ] 3.6 Update `simulated-ollama.ts` for the new prompts (a claim per kind, a changed claim that swaps one word, CONTRADICTS by default), keeping the existing `claimVerdict` option; verify controller Verify tests still pass
- [ ] 3.7 Run `pnpm test` and `pnpm lint`, then commit ("Choose the claim kind in code and check the change")

## 4. Reveal

- [ ] 4.1 Add English and French messages for "The book says", the changed-words line, "(added)" and "(removed)" (design decision 10); verify with the i18n key-parity test
- [ ] 4.2 Show the true claim and one line per change under the false-claim reveal in `VerifySession.svelte`, nothing extra for true claims; verify with component tests: false reveal shows the kind, the true claim and `before → after`, insertion and deletion lines, true reveal shows none of these, French rendering
- [ ] 4.3 Update `e2e/verify-mode.spec.ts` for the new reveal (changed words visible after judging a false claim, absent before judging); verify with `pnpm exec playwright test`
- [ ] 4.4 Run `pnpm test` and `pnpm lint`, then commit ("Show what was changed in the Verify reveal")

## 5. Real-world check and wrap-up

- [ ] 5.1 Run the manual test 3 × 20 claims on *Candide* with the same setup as 1.3, plus one French EPUB; record the tally next to the baseline in this design: `unverified` rate, offered true/changed, confirmations by attempt, `NONE` per kind, fresh-passage attempts, diff rejections, front-matter claims (expected 0), time per claim, and a by-eye judgement of whether each change matters to the story; verify the notes are written
- [ ] 5.2 Set `MUTATION_VERIFY_RETRIES` (design decision 9) and, if the trace calls for it, the diff limits and the kind order; update the doc comments to say they are measured; verify `pnpm test` still passes
- [ ] 5.3 Check the reveal once in the real app (`pnpm dev`) with a changed claim; verify the true claim and changed words show correctly in English and French
- [ ] 5.4 Update the README Verify section (the reveal shows the true claim and changed words) and Status; run markdownlint on the edited markdown files
- [ ] 5.5 Add the new French messages to the deferred French review memory file (`french-indexing-text-review-deferred.md`), run `pnpm test` and `pnpm lint`, then commit ("Finish improve-claim-mutation-quality")
