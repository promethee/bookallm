# Tasks

## 1. Conversation state on the controller

- [x] 1.1 Add the `Turn` type and `turns`/`askBusy` state to `OnboardingController`, and verify `pnpm typecheck` passes
- [x] 1.2 Add `askQuestion` (guards on `askBusy` and an empty question, loads the book, calls `retrievePassages` then `generateAnswer` with the configured models, streams into the turn, resolves citations on completion) and verify controller tests with fake services cover a full successful turn (text and citations match what was streamed), an empty question doing nothing, and a second question being refused while one is in flight
- [x] 1.3 Add `stopAnswer` and the abort/failure finalisation shared with it (distinguishing a user abort from a mid-stream failure only by checking the controller's own signal), and verify tests cover stopping mid-answer (partial text and citations kept, a new question can be asked at once) and a mid-stream failure (partial text kept, turn marked failed)
- [x] 1.4 Add `retryTurn` (re-runs the same question in place, same id and position) and verify a test covers a failed turn retried successfully and earlier turns left unchanged
- [x] 1.5 Clear `turns` at each of the three places the controller sets a new `activeBook`, and verify tests cover the conversation clearing when a new book is imported, an existing book is recognised, and a confirmed duplicate is added
- [x] 1.6 Cover the remaining typed failures for both steps (retrieval unreachable/model-not-found/embed-failed, generation unreachable/model-not-found/chat-failed) and verify each maps to a failed turn with that error kept
- [x] 1.7 Commit checkpoint: "Add the conversation to the controller"

## 2. Screen text

- [ ] 2.1 Add English and French messages for the question field, submit, stop, retry, the "getting ready" wait note, the sources heading, each typed failure, and the two announcements, and verify the language table parity test passes and no message uses an em dash
- [ ] 2.2 Commit checkpoint: "Add the Ask mode conversation text"

## 3. The screen

- [ ] 3.1 Add `AskConversation.svelte` (question field and submit, disabled while busy; each turn's question, streamed answer text, waiting note, sources list with chapter and quoted passage text, failure block with retry; stop button while streaming) and show it from `LandingScreen.svelte` in place of the "coming soon" text whenever a book is active, and verify component tests cover a question being asked and its answer and citations appearing, the waiting note before the first piece of text, stopping an answer, a failed turn with retry, and the question field being disabled while busy
- [ ] 3.2 Verify component tests cover keyboard reachability of the field, submit, stop and retry, and that completion and failure are announced (not every streamed piece)
- [ ] 3.3 Verify component tests cover the same flow in French
- [ ] 3.4 Commit checkpoint: "Add the Ask mode conversation screen"

## 4. End to end

- [ ] 4.1 Add `/api/chat` support to the Playwright Ollama mock (reusing the simulated-Ollama route's shape: scripted chunks, a citing default answer, an error line, a drop switch) and verify a Playwright test asks a question and sees the streamed answer and a citation with its chapter and passage text
- [ ] 4.2 Add Playwright tests for stopping an answer mid-stream, a failed turn with retry succeeding, a `nothing-relevant` question showing the fixed reply, the conversation clearing after a reload, and the conversation clearing when a different book becomes active; verify they pass together with the existing suite
- [ ] 4.3 Commit checkpoint: "Add Ask mode conversation end-to-end tests"

## 5. Real-world checks

- [ ] 5.1 Drive the running app in the browser against the real Ollama: ask a real question about the real Pride and Prejudice, confirm the streamed answer, its citation and the "getting ready" wait note, try stopping an answer, and try a question with nothing relevant in the book; record the result
- [ ] 5.2 With the user, run `pnpm tauri dev` and confirm in the real window that asking, streaming, citations, stop and retry all work; record the result
- [ ] 5.3 Ask the user to skim the new French text and record any corrections
- [ ] 5.4 Commit checkpoint: "Record real-world Ask mode conversation checks"

## 6. Wrap-up

- [ ] 6.1 Update the README status, verify `pnpm check` passes end to end, and verify `openspec validate ask-mode-screen --strict` passes
- [ ] 6.2 With the user's approval to push, verify CI is green on the pushed branch
- [ ] 6.3 Commit checkpoint: "Finish ask-mode-screen", then archive the change
