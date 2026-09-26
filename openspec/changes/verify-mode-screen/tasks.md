# Tasks

## 1. Controller state and actions

- [x] 1.1 Add `mode` (default `'ask'`, never saved) and `setMode` to `OnboardingController`; verify with a new `controller.verify.test.ts` case that a fresh controller is in Ask mode and `setMode('verify')` switches it
- [x] 1.2 Add the Verify state (`idle`/`generating`/`ready`/`revealed`/`failed`), `verifyTally`, private `usedChunkIds` and `verifyAbort`, and `requestClaim` calling `generateClaim` with the loaded book, chat model, client and `excludeChunkIds`; verify with controller tests: idle until requested, `generating` then `ready` with the claim, only one claim generating at a time
- [x] 1.3 Add `stopClaim` (back to idle, tally unchanged) and `judgeClaim(guess)` (`revealed`, tally updated, judged only once); verify with controller tests covering a stop, a correct and a wrong judgment, and a second `judgeClaim` being ignored
- [x] 1.4 Map failures to the `failed` state with the typed error, add `retryClaim`, and implement design decision 3 (used chunks excluded; on `no-chunks-available` with a non-empty used list, empty it and try once more); verify with controller tests for unreachable, unverified, retry, exclusion of used chunks, and the start-over case on a two-chunk book
- [x] 1.5 Add `resetBookSession()` and call it wherever `turns` is cleared today (import, duplicate answer, book switch), aborting any claim in progress; verify with a controller test that changing the active book clears the claim, tally and used chunks
- [x] 1.6 Announce claim ready, reveal (right or not right) and failure through `announce`; verify with controller tests on the announcer
- [x] 1.7 Run `pnpm exec vitest run src/lib` and `pnpm lint`, then commit ("Add Verify mode state to the controller")

## 2. Interface

- [x] 2.1 Add English and French messages: tab labels, Verify disclosure line, get claim, waiting note, stop, true, false, verdicts (right / not right, claim was true / false), changed-attribute phrases, next claim, tally, source label, and failure messages (unreachable, model not found, could not make a fair claim, other); verify with the existing i18n key-parity test
- [x] 2.2 Add the tabs to `LandingScreen.svelte` per design decision 4 (tablist, roving tabindex, Left/Right keys, tabpanel), shown only for a ready active book, with the disclosure line following the mode and Verify's amber styling; verify with a component test: tabs present only for a ready book, Ask selected by default, switching changes the line and panel, arrow keys move selection
- [x] 2.3 Create `VerifySession.svelte`: get-claim action, waiting note with stop, claim card with true/false, reveal with verdict, changed attribute when false, source passage with chapter, next claim, tally, failure message with retry; verify with `verify-session.test.ts` covering each state in English and one full flow in French
- [x] 2.4 Verify the round trip: a component test that asks a question, switches to Verify, judges a claim, switches back, and finds the Ask conversation, claim and tally unchanged
- [x] 2.5 Run `pnpm exec vitest run` and `pnpm lint`, then commit ("Add Verify mode tabs and screen")

## 3. End to end

- [x] 3.1 Add a mocked `/api/chat` script for the three claim-mutation prompts to `e2e/support.ts` (extraction, mutation, verification replies), without changing existing Ask mode mocks; verify existing e2e specs still pass
- [x] 3.2 Add `e2e/verify-mode.spec.ts`: switch to Verify, get a claim, judge it, see the reveal and the tally; keyboard-only run through the tabs and every action; a failure with retry; verify with `pnpm exec playwright test`
- [x] 3.3 Commit ("Add Verify mode e2e tests")

## 4. Real-world check and wrap-up

- [ ] 4.1 With the app pointed at the GPU machine (`http://192.168.0.66:11434`, set through the app's Ollama address setting), open a real indexed book, generate and judge at least five claims, and record in this change's design.md: time per claim, how many came out unverified, and whether true and changed claims both appeared; verify the notes are written
- [ ] 4.2 Update the README Status section to say Verify mode's screen (mode tabs, session tally) works end to end; verify the "not built yet" sentence no longer lists it
- [ ] 4.3 Flag the new French messages for the deferred French review (memory file `french-indexing-text-review-deferred.md`), then commit ("Finish verify-mode-screen")
