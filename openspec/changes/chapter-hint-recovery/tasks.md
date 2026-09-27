# Tasks

## 1. Libraries

- [x] 1.1 Add `chapterNumber?: number` to `retrievePassages` (design decision 1): score only that chapter's chunks, load only its vector record, return `nothing-relevant` with no passages and no request for an empty chapter; verify with new `retrieve.test.ts` cases: only that chapter's passages, a better match in another chapter ignored, low scores still returned with `nothing-relevant`, empty chapter sends nothing, and whole-book search unchanged
- [x] 1.2 Create `src/lib/recovery/chapter-hint.ts` with `findChapterReference` and `matchChapterByTitle` (design decision 2), exported through `src/lib/recovery/index.ts`; verify with `chapter-hint.test.ts`: English and French words, `ch.`/`chap.`/`n°`, digits and Roman numerals, case-insensitivity, no match for bare numbers or number words, whole-number matching (7 vs 17, VII vs VIII), titles starting with a number, the lone "I" title, empty chapters excluded, zero and several matches
- [x] 1.3 Run `pnpm exec vitest run src/lib` and `pnpm lint`, then commit ("Add chapter-restricted retrieval and chapter hint parsing")

## 2. Controller

- [x] 2.1 Extend `Turn` with `kind`, `verdict`, `chapter`, `retryOf`, `recovered` and `handedOver` (design decision 4), and record the verdict on `question` turns; verify with a `controller.ask.test.ts` case that a nothing-found question's turn carries `verdict: 'nothing-relevant'` and a relevant one `'relevant'`, with existing Ask tests unchanged
- [x] 2.2 Add `retryInChapter(turnId, chapterNumber)`: marks the nothing-found turn `recovered`, runs a `chapter-retry` turn with the chapter filter and the verdict override, and refuses when the target is not an un-recovered nothing-found question or something is busy; verify with a new `controller.recovery.test.ts`: retry turn created with the chapter and original question, only that chapter's passages cited, below-cutoff passages answered from, second retry of the same turn ignored, busy refused
- [x] 2.3 Implement the hand-over (design decision 3): a finished, not-stopped chapter retry with no citations, or an empty chapter, sets `handedOver` to the chapter text; stopped and failed retries do not; `retryTurn` on a failed chapter retry re-runs it in place; verify with recovery controller tests for each case
- [x] 2.4 Route typed hints in `askQuestion`: after an un-recovered nothing-found turn, one title match calls `retryInChapter`, zero or several add a `hint-unclear` turn, and any other message (or a chapter mention after a relevant turn) is a normal question; verify with recovery controller tests for each branch
- [x] 2.5 Announce hand-over and unclear hints (`announce.chapterShown`, `announce.chapterUnclear`), reusing the answer done/failed announcements for the retry itself; verify with recovery controller tests on the announcer
- [x] 2.6 Run `pnpm exec vitest run src/lib` and `pnpm lint`, then commit ("Add chapter retry and hand-over to the controller")

## 3. Interface

- [x] 3.1 Add the English and French `recovery.*` and announcement messages from design decision 7; verify with the existing i18n key-parity test
- [x] 3.2 In `AskConversation.svelte`, show the chapter offer (labelled `<select>` of chapters with text plus "Look in this chapter") under an un-recovered nothing-found turn and on a `hint-unclear` turn, per design decision 5; verify with `ask-conversation.test.ts` cases: offer shown only there, empty chapters absent, choosing a chapter starts the retry, offer gone once recovered
- [x] 3.3 Show a `chapter-retry` turn's "Looking in …: <question>" label, and the hand-over message with the `<details open>` scrolling chapter block (design decision 6); verify with component tests: label shown, block shown only on hand-over, paragraphs kept, collapse and expand work
- [x] 3.4 Verify keyboard and French: a component test that reaches the select, chooses a chapter and toggles the block by keyboard alone, and one full recovery flow in French
- [x] 3.5 Run `pnpm exec vitest run` and `pnpm lint`, then commit ("Add chapter recovery to the Ask conversation")

## 4. End to end

- [ ] 4.1 Extend the mocked Ollama in `e2e/support.ts` so a book has a question with nothing relevant, a chapter whose passages answer it with a citation, and one whose answer cites nothing, without changing existing mocks; verify existing e2e specs still pass
- [ ] 4.2 Add `e2e/retrieval-recovery.spec.ts`: nothing found, choose a chapter, cited answer; typed "chapter N" hint; unclear hint offers the list; uncited retry hands over the chapter, collapsible; keyboard-only run; verify with `pnpm exec playwright test`
- [ ] 4.3 Commit ("Add retrieval recovery e2e tests")

## 5. Real-world check and wrap-up

- [ ] 5.1 With the app on the local Ollama (`http://127.0.0.1:11434`, GPU machine) and a real indexed book, ask at least three questions that find nothing, recover each through a chapter (at least one by the list, one typed if the book's titles carry numbers), and record in this change's design.md: time per retry, how many answered with citations vs handed over, and how the book's chapter titles behaved for typed hints; verify the notes are written
- [ ] 5.2 Update the README Status section to say retrieval recovery works end to end, removing it from the "not built yet" sentence; verify with markdownlint
- [ ] 5.3 Add the new French messages to the deferred French review memory file (`french-indexing-text-review-deferred.md`), then commit ("Finish chapter-hint-recovery")
