# Design

## Context

`retrievePassages({ book, question, model, client, store, signal })` returns `{ status: 'ok', verdict, passages }` (each passage has `chunkId`, `text`, `locator`, `score`), `{ status: 'aborted' }` or a typed `{ status: 'failed', error }`. `generateAnswer({ verdict, question, passages, model, client, language, signal })` returns `{ status: 'ok', chunks, citations }` (`chunks` an `AsyncGenerator<string>`, `citations()` read after the stream ends), `{ status: 'aborted' }` or a typed `{ status: 'failed', error }`; iterating `chunks` can itself throw a typed error mid-stream. Real measurement (`answer-generation`'s real-world check): a cold `llama3.1:8b` took 252–327 seconds to answer one word on a busy machine; once warm, generation was seconds. The onboarding controller already holds one piece of state per concern (`pull`, `indexState`) next to `activeBook`, computed via `library.getBook(entry.hash)`; `decideScreen` reaches `landing` only once the active book, if any, is fully indexed (`index-book` intercepts it otherwise), so a book present at `landing` is always ready to search. See proposal.md for scope.

## Goals / Non-Goals

**Goals:**

- Reuse `retrievePassages` and `generateAnswer` exactly as built; no changes to either library.
- One conversation, one active answer at a time, held in the existing controller next to the other per-session state.
- A citation the reader can actually check: its chapter and its exact passage text, not just a number.

**Non-Goals:**

- A book switcher, mode tabs, or a command palette: listed in the proposal as later or v2.
- Rendering `[1]`-style markers in the prose as clickable, positioned chips. The citations list is shown separately, keyed by the same numbers the prose already carries; a future change can use each citation's `offset` (already computed) to place an inline marker precisely.

## Decisions

1. **Conversation state lives on `OnboardingController`, not a new store.** A `turns: Turn[]` array and `askBusy` (derived from the last turn's state), alongside the existing `pull`/`indexState`/`importState`. This keeps "one thing happens at a time, in one place" consistent with the rest of the controller, and needs no new context or store plumbing.

   ```ts
   interface Turn {
     id: string;
     question: string;
     state: 'waiting' | 'streaming' | 'done' | 'failed';
     /** True once every piece of an answer this run will produce has arrived, one way or another. */
     stopped: boolean;
     text: string;
     citations: Citation[];
     error?: RetrievalError | AnswerError;
   }
   ```

   `waiting` is before the first piece of text; `streaming` is once at least one piece has arrived. The "slow first answer" note (Requirement: A slow first answer says why) shows exactly while `state === 'waiting'`.

2. **`askQuestion(question)`.** Rejects (no-op) if `askBusy` or the trimmed question is empty, matching "nothing is asked, the field stays as it was". Otherwise: pushes a new `waiting` turn, creates an `AbortController`, and:
   - loads the active book (`library.getBook(entry.hash)`) and calls `retrievePassages` with `model: settings.embeddingModel`;
   - on `failed`, sets the turn to `failed` with that error and stops;
   - on `ok`, calls `generateAnswer` with `model: settings.chatModel`, `language: getLanguage()`, the same passages and verdict;
   - on `generateAnswer` `failed`, same as above;
   - otherwise iterates `chunks`, appending each piece to `turn.text` and flipping `waiting` to `streaming` on the first one;
   - if the iteration throws (a mid-stream `AnswerError`), sets `failed` with that error, keeping the text and citations already gathered, the same "keep what was done" rule indexing already follows;
   - if it ends without throwing, calls `citations()`, sets `state: 'done'`, and announces completion.
   
   Both `retrievePassages` and `generateAnswer`'s `aborted` results, and an abort partway through the chunk loop, are told apart from a real failure only by checking `controller.signal.aborted` once the attempt ends; either way the turn is left exactly as far as it got (`stopped: true`), per the spec's "keep whatever had arrived" requirement, and `askBusy` clears so another question can be asked at once.

3. **`stopAnswer()`** aborts the in-flight turn's controller. Nothing else: the same code path above notices the abort and finalises the turn.

4. **`retryTurn(id)`** re-runs `askQuestion` with that turn's own question text, replacing the failed turn in place (same `id`, same position) rather than appending a new one, so "earlier turns are unaffected" and the retried turn does not visually duplicate.

5. **The conversation resets with the session (nothing to do, it is in-memory state) and with the active book.** Every place the controller sets a new `activeBook` (a new import, an existing book recognised, a confirmed duplicate) also clears `turns`, immediately after the `save({ activeBook })` call. Three call sites; no new abstraction needed for three explicit resets.

6. **`AskConversation.svelte`, shown from `LandingScreen.svelte` whenever `controller.activeBook` is set.** `decideScreen` guarantees a book present at `landing` is fully indexed, so no readiness check is needed in the component itself. It replaces the current "coming soon" paragraph; the rest of `LandingScreen` (title, mode line, book card, import button) is unchanged and stays available above the conversation, so importing a different book remains reachable at any time.

7. **Layout, reusing existing patterns.** A text `<input>` plus a submit `Button`, disabled together while `askBusy`. Each turn: the question as a heading-weight line, then the answer text in a `<p class="whitespace-pre-wrap">` (plain text, Svelte's default escaping, no markdown rendering), then, once `citations.length > 0`, a small "Sources" list: each citation as its chapter title plus its passage text in a `<blockquote>`. A `role="status"` line shows "waiting" wording while `state === 'waiting'`. A failed turn shows the same `role="alert"` plus typed-message plus retry pattern as `IndexingScreen`, mapped from whichever of `RetrievalError`/`AnswerError`'s overlapping codes (`unreachable`, `model-not-found`) or their own (`embed-failed`, `chat-failed`, `index-mismatch`) is present, each falling back to a generic "could not answer" message with the detail under a details element for the ones with no dedicated wording. Focus moves to the heading once per screen change, as elsewhere; each new turn's answer area is announced only on completion (`announce.answerDone` / `announce.answerFailed`), not on every streamed piece, to avoid a live region firing on every token.

## Risks / Trade-offs

- [A long-running stream on a slow machine ties up the only in-flight slot] → The reader can stop it at any time (Requirement: An answer can be stopped), and the "slow first answer" note sets the expectation from the start, following the same honesty principle as the indexing screen's own wait state.
- [Retrieval and generation each call Ollama with a different model; `answer-generation`'s real check found this machine reloads one model to serve the other, so a normal question-and-answer turn can itself take several minutes] → Out of scope to fix here (recorded in that change's design as a resource-management question for later); this change's wait wording and stoppability already assume a slow turn is normal, not a failure.
- [The prose's `[1]`-style markers are shown raw, so a reader who does not connect them to the sources list below might miss which claim ties to which citation] → Accepted for v1: the number is right there in the text and the same number labels its source below; a positioned inline citation is future work using the `offset` the answer library already computes.
- [Only the last failed turn can sensibly be retried without re-asking earlier ones; if two turns fail while offline, each keeps its own retry] → Each turn's retry only re-runs that one turn, never the whole conversation, so this is inherent to the per-turn design and not actually a problem.

## Migration Plan

None. No stored data or storage format changes; the conversation is in-memory only.

## Open Questions

None.
