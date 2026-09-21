# Tasks

## 1. Similarity and ranking

- [x] 1.1 Add `src/lib/retrieval/types.ts` and `defaults.ts` (default number of passages, question length limit, a provisional relevance cutoff with a comment saying it is not yet measured), and verify `pnpm typecheck` passes
- [x] 1.2 Add cosine similarity and top-k ranking with ties broken by chunk order, and verify table-driven tests cover identical, orthogonal, opposite and zero-length vectors, the ordering, ties, and a limit above the number of chunks
- [x] 1.3 Commit checkpoint: "Add similarity and ranking"

## 2. The retrieval function

- [x] 2.1 Let the simulated Ollama answer chosen texts with fixed vectors, and verify a test proves it and that the deterministic default still works for other texts
- [x] 2.2 Add `retrievePassages` (clean the question, require a complete index, embed with the configured model, read the saved vectors, score, rank, attach text and locators), and verify tests cover ranking order, locators equal to the chapter text at the range, an exact-text question ranking first, the default and small limits, and repeatable results
- [x] 2.3 Add the relevance verdict from the cutoff, and verify tests cover scores just below, at and above the cutoff, passages returned in both cases, and the verdict following the best passage only
- [x] 2.4 Cover the typed failures and cleaning: empty and untidy and very long questions, not indexed and partly indexed with no request sent, unreachable, model not found, unusable answer, index mismatch, abort, question sent only to the configured address, and nothing written to the store; verify all pass
- [x] 2.5 Commit checkpoint: "Add passage retrieval"

## 3. Real-world measurement

- [x] 3.1 Add `real-retrieval.manual.test.ts` (skipped unless an environment variable is set) that indexes the first chapters of the real book with a vector cache file, asks a written set of answered, unrelated and same-subject-but-absent questions, and prints the best scores and passages; verify it is skipped in the normal run and typechecks
- [x] 3.2 With the user's Ollama, embed the first 10 chapters of the real Pride and Prejudice (about 150 chunks, about an hour on the current machine, resumable) and run the questions; record the scores, the gap and the limits in the design
- [x] 3.3 Set the relevance cutoff from the measurement, replace the provisional comment with where the value came from, and verify the unit tests and the manual test agree with it
- [x] 3.4 Commit checkpoint: "Record the retrieval measurements"

## 4. Wrap-up

- [x] 4.1 Update the README status, verify `pnpm check` passes end to end, and verify `openspec validate passage-retrieval --strict` passes
- [ ] 4.2 With the user's approval to push, verify CI is green on the pushed branch
- [ ] 4.3 Commit checkpoint: "Finish passage-retrieval", then archive the change
