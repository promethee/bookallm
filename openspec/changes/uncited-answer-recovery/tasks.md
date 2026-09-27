# Tasks

## 1. Prerequisites

- [x] 1.1 Archive `chapter-hint-recovery` (all its tasks are done) so
      `openspec/specs/retrieval-recovery/spec.md` exists (design decision 6);
      verify `openspec validate uncited-answer-recovery --strict` passes with no
      "archive would refuse" notice, then commit ("Archive
      chapter-hint-recovery")
- [x] 1.2 Install dependencies in this worktree (`pnpm install`); verify
      `pnpm test`, `pnpm test:e2e` and `pnpm lint` pass on the unchanged code

## 2. Controller

- [x] 2.1 Change `canRecover` to: `question` turn, done, not stopped, not
      recovered, no citations (design decision 1), and update its doc comment;
      verify with new `controller.recovery.test.ts` cases: a `relevant` answer
      ending with an unresolved `[None]` marker is recoverable, one with no
      marker is recoverable, one with a resolved citation is not, a stopped
      uncited answer is not, a failed answer is not, a chapter retry that cites
      nothing is not, and existing nothing-found cases still pass
- [x] 2.2 Load `chapterChoices` for every whole-book `question` turn once
      retrieval returns (design decision 2); verify with a recovery controller
      test that `retryInChapter` on an uncited `relevant` turn creates a
      `chapter-retry` turn with the chosen chapter and the original question,
      marks the original `recovered`, and that a second retry is ignored
- [x] 2.3 Verify typed hints after an uncited answer (design decision 5) with
      recovery controller tests: "try chapter N" with one title match retries,
      no match adds a `hint-unclear` turn, a second typed try after it retries
      the original question, and a chapter mention after a cited answer is a new
      question
- [x] 2.4 Run `pnpm test` and `pnpm lint`, then commit ("Make uncited whole-book
      answers recoverable")

## 3. Interface

- [x] 3.1 Add `recovery.uncited` in English and French (design decision 4);
      verify with the existing i18n key-parity test
- [x] 3.2 In `AskConversation.svelte`, show `recovery.uncited` above the chapter
      offer when the turn is recoverable and its verdict is `relevant` (design
      decision 3); verify with `ask-conversation.test.ts` cases: model text
      shown unchanged with the line and the offer and no Sources block; no line
      on a nothing-found turn; neither line nor offer on a cited answer; both
      gone once a chapter is chosen; the line in French
- [x] 3.3 Run `pnpm test` and `pnpm lint`, then commit ("Offer chapters under
      uncited answers")

## 4. End to end

- [x] 4.1 Make the mocked Ollama give a question with relevant passages a chat
      reply with no resolvable citation (ending in `[None]`), then a cited reply
      for the retry, without changing existing mocks. No `e2e/support.ts` change
      was needed: the spec sets the mock's `chatChunks` before the question and
      clears it before the retry, as the existing hand-over test does; verify
      existing e2e specs still pass
- [x] 4.2 Add cases to `e2e/retrieval-recovery.spec.ts`: an uncited answer shows
      the model's text, the "cites no passage" line and the chapter list;
      choosing a chapter gives a cited retry; typing "chapter N" after an
      uncited answer retries; a cited answer shows no offer; verify with
      `pnpm test:e2e`
- [x] 4.3 Run `pnpm test`, `pnpm test:e2e` and `pnpm lint`, then commit ("Add
      uncited-answer recovery e2e tests")

## 5. Real-world check and wrap-up

- [x] 5.1 With the app (`pnpm dev`, port 5287) on the local Ollama
      (`llama3.1:8b`, `bge-m3`) and the indexed Gutenberg _Candide_, ask "What
      was the name of Pangloss's dog?" and at least two other on-topic questions
      the book does not answer, plus two it does. Record in this change's
      design.md: which answers were uncited and got the offer, whether any cited
      answer wrongly got it, the outcome of each chapter retry (cited or handed
      over) and its time; verify the notes are written
- [x] 5.2 Update the README Status paragraph to say recovery is also offered
      after an answer that cites no passage; verify with
      `npx markdownlint-cli README.md openspec/changes/uncited-answer-recovery/**/*.md`
- [x] 5.3 Add `recovery.uncited` (French) to the deferred French review memory
      file (`french-indexing-text-review-deferred.md`), then run `pnpm test`,
      `pnpm test:e2e` and `pnpm lint` and commit ("Finish
      uncited-answer-recovery")
