# Tasks

## 1. Types and chunk selection

- [x] 1.1 Add `src/lib/mutation/types.ts` (`MutationError`, `MutationErrorCode` = `'unreachable' | 'model-not-found' | 'chat-failed' | 'no-chunks-available' | 'unverified'`, `MutationClaim` with `claim`, `isTrue`, `changedAttribute?`, `citation` (chunkId/locator/text), `difficulty: 'flat'`, and `MutationResult` = `ok`/`aborted`/`failed`), and `defaults.ts` (`MUTATION_VERIFY_RETRIES`, the three prompt templates), and verify `pnpm typecheck` passes
- [x] 1.2 Add `pickChunk(book, excludeChunkIds, random?)`: uniformly random among the book's chunks not excluded, `random` defaulting to `Math.random` and injectable for tests; returns a typed `no-chunks-available` outcome when every chunk is excluded or the book has none, and verify unit tests cover a normal pick, every-chunk-excluded, an empty book, and that an injected deterministic `random` picks predictably
- [x] 1.3 Commit checkpoint: "Add chunk selection"

## 2. The three chat calls and `generateClaim`

- [x] 2.1 Add the extraction call: one `streamChat` request per `answering/chat.ts`'s existing shape, prompting for one concrete, checkable claim (cause, order of events, who did or said it, or where) from a given chunk's text, draining the stream to a plain string; verify a unit test (a fake Ollama) proves the prompt carries the chunk's text and the returned claim is the drained text
- [x] 2.2 Add the mutation call: given the true claim and the source chunk, prompts for a changed version altering exactly one of those same four attribute kinds while keeping the rest accurate, draining to a plain string plus which attribute kind was targeted; verify a unit test proves the prompt carries both the true claim and the source text
- [x] 2.3 Add the verification call: given the source chunk and the changed claim, prompts for a single-word contradiction judgement, parsed tolerantly (matching the requested word pair, not strict text equality); verify unit tests cover a confirmed contradiction, a not-confirmed answer, and an unparseable answer being treated as not confirmed
- [x] 2.4 Add `generateClaim(options)`: picks a chunk (1.2), extracts a true claim (2.1), generates and verifies a changed version (2.2 + 2.3), retrying the mutation+verify pair up to `MUTATION_VERIFY_RETRIES` on a not-confirmed result before returning a typed `unverified` failure, then chooses unpredictably (injectable `random?: () => number`, reusing the same default as 1.2) which version to return, always with the source chunk as the citation and `difficulty: 'flat'`; verify unit tests cover a successful true-claim result, a successful changed-claim result, a retry that succeeds on the second attempt, and exhausting retries into a typed `unverified` failure
- [x] 2.5 Cover the remaining typed failures and the "nothing written, only the configured address contacted" requirements (unreachable, model not found, a chat answer that cannot be used, abort at each of the three calls ending the attempt without an error result, no write to any store/settings/vector data during a call), and verify all pass. "No write to any store" is satisfied structurally, not by a runtime test: `generateClaim` takes only `book` (already loaded), `model` and `client` - no library/settings/vector-store reference exists anywhere in this module for it to write through
- [x] 2.6 Commit checkpoint: "Add claim generation"

## 3. Real-world check

- [x] 3.1 Add a manual test (skipped unless `OLLAMA_URL` is set, matching `answer-generation`'s own real-check pattern), reusing a cached real book already indexed by an earlier change's real-world check if one is still available, or a fresh small real book otherwise; generates several claims in a row and prints each one's claim text, whether it was offered true or changed, the changed attribute when applicable, and the citation; verify it is skipped in the normal run and typechecks
- [x] 3.2 With the user's Ollama, run it and read the results by hand against the source chunks: is each claim actually checkable and grounded in its chunk, does the changed version really alter only one attribute, does verification's confirm/reject match your own judgement reading the passage, and does the true/changed split look unpredictable across several claims rather than favouring one; record the transcript, what worked, and any prompt fix or retry-count adjustment it revealed, in the design — first attempt `unverified` (822.8s); root-caused (model sometimes drops the ATTRIBUTE:/CLAIM: labels), fixed with a tolerant parser fallback, reconfirmed live: a real `CHANGED (order)` claim, correctly one-attribute, genuinely contradicting the source, verified successfully. True/changed unpredictability not re-checked across multiple real claims (time budget); covered by unit tests instead. See design.md.
- [x] 3.3 Commit checkpoint: "Record the claim-mutation real-world check"

## 4. Wrap-up

- [x] 4.1 Update the README status, verify `pnpm check` passes end to end, and verify `openspec validate claim-mutation --strict` passes
- [x] 4.2 With the user's approval to push, verify CI is green on the pushed branch
- [x] 4.3 Commit checkpoint: "Finish claim-mutation", then archive the change
