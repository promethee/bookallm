# Tasks

## 1. The streaming chat call

- [x] 1.1 Add `src/lib/answering/types.ts` and `defaults.ts` (the system prompt template, the stream timeout constant, the citation marker pattern), and verify `pnpm typecheck` passes
- [x] 1.2 Add `chat.ts`: `POST /api/chat` with `stream: true`, reusing `readNdjson`, yielding each message chunk of text and surfacing Ollama's `done`/error lines, with a stream timeout and typed failures (unreachable, model-not-found, chat-failed) classified as `embed.ts` and `pull.ts` do; verify unit tests cover success streaming in order, an error line mid-stream (the generator throws), a dropped connection, a stall past the timeout, 404/model-not-found, and abort before and during the stream
- [x] 1.3 Add `POST /api/chat` to the simulated Ollama (a scripted list of text chunks, an error line, a drop-after-N switch, a stall switch, and a deterministic default answer that cites passage 1) and verify a test proves the default and each switch
- [x] 1.4 Commit checkpoint: "Add the streaming chat call"

## 2. Citations and the answer function

- [x] 2.1 Add `citations.ts`: parse `[n]` / `[n, m]` markers from complete text, resolve each number against a given ordered passage list (1-based), drop numbers outside that range, and return the citations with each cited passage's locator and the marker's character offset; verify table-driven tests cover a single marker, several markers, out-of-range numbers, malformed brackets, no markers, and markers at the start/end of the text
- [x] 2.2 Add `generateAnswer` (verdict, question, ranked passages, model, client, signal → streamed chunks plus a `citations()` read after the stream ends), numbering passages in the prompt in the order given, and verify tests cover the prompt containing every passage, chunks joining to the full answer text in order, and citations matching the markers actually produced
- [x] 2.3 Add the `nothing-relevant` path (no Ollama call, the fixed reply streamed as one chunk, `citations()` empty) in English and French via `answering.nothingFound` in `src/lib/i18n/messages.ts`, and verify a test proves no request is sent and the returned text matches `t()` in each language
- [x] 2.4 Cover the remaining typed failures and the "nothing written, nothing sent elsewhere" requirements (unreachable, model not found, a mid-stream error, abort before and during the stream, only the configured address contacted, no write to any store or settings during a call), and verify all pass
- [x] 2.5 Commit checkpoint: "Add answer generation"

## 3. Real-world check

- [x] 3.1 Add `real-answer.manual.test.ts` (skipped unless `OLLAMA_URL` is set), reusing the passage data and questions from the `passage-retrieval` change's cached measurement, asking the real chat model to answer each and printing the streamed text and resolved citations; verify it is skipped in the normal run and typechecks
- [ ] 3.2 With the user's Ollama, run it for the answered questions from that measurement and read the results: does the model stay inside the offered passages, are the citation markers well-formed and resolvable, do they point at passages that plausibly support the claim; record the transcript, what worked, and any prompt or parsing fix it revealed, in the design
- [ ] 3.3 Commit checkpoint: "Record the answer-generation real-world check"

## 4. Wrap-up

- [ ] 4.1 Update the README status, verify `pnpm check` passes end to end, and verify `openspec validate answer-generation --strict` passes
- [ ] 4.2 With the user's approval to push, verify CI is green on the pushed branch
- [ ] 4.3 Commit checkpoint: "Finish answer-generation", then archive the change
