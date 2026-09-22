# Design

## Context

Retrieval (`src/lib/retrieval/`) returns `Passage[]` (chunk text, exact locator, cosine score) and a `Verdict` (`relevant` | `nothing-relevant`) for a question, from a book already indexed. `embedTexts` shows the established shape for a typed Ollama call: `client.request(path, init)`, an `AbortSignal`, a discriminated `EmbedResult`. `pullModel` shows the established shape for a *streaming* one: `readNdjson(response.body)` yields parsed lines one at a time, a `ProgressTracker` folds them into a running state, and the caller reads the async generator until it ends or the signal aborts. The chat model defaults to `llama3.1:8b`; no code calls `/api/chat` yet. See proposal.md for scope and the two decisions already made (numbered-citation grounding, streaming).

## Goals / Non-Goals

**Goals:**

- One pure, testable function that turns a question and passages into a streamed, cited answer, in the same shape as `embedTexts` and `pullModel`.
- A citation mechanism that is mechanically checked: a citation the function returns always resolves to a passage the caller actually offered.
- No hidden state: nothing is written, and the same passages and question ask the same thing of Ollama.

**Non-Goals:**

- Conversation, history, screens, chapter-restricted retry, and Verify mode's mutate-then-verify pipeline. Listed in the proposal.
- Streaming citations *as* the text streams. Markers are resolved once the stream ends, because a marker such as `[1` can be split across chunks and a half-seen marker cannot be resolved yet; the non-goal is only the added complexity of incremental citation resolution, not streaming itself, which is a goal.

## Decisions

1. **New module `src/lib/answering/`, no UI code.** `chat.ts` (the streaming Ollama call), `citations.ts` (marker parsing and resolution), `generate.ts` (the function), `defaults.ts` (the prompt template and the fixed "nothing found" reply, in the structural sense; see decision 6), `types.ts`. Same shape as `retrieval` and `indexing`.

2. **The Ollama call.** `POST /api/chat` with `{ model, messages: [{ role: 'system', content }, { role: 'user', content: question }], stream: true }`. The system message states the passages, numbered, and instructs: answer only from them, mark every claim with the number(s) of the passage(s) it rests on like `[2]`, do not invent facts outside them. `readNdjson` is reused as-is; each line has `{ message: { content: string }, done: boolean }` (Ollama's chat streaming shape) or an `{ error }` line. Failures classify the same way `embedTexts` does: connection/timeout is `unreachable`, a 404 or "not found" message is `model-not-found`, anything else keeps Ollama's message. _Alternative: `/api/generate` with a single prompt string, rejected: `/api/chat`'s system/user split keeps instructions and the reader's actual words apart, and is the shape a later conversation turn extends naturally._

3. **Streaming shape.** `generateAnswer` returns `{ status: 'ok', chunks }` where `chunks` is an `AsyncGenerator<string>` the caller iterates for the answer's text, in order; `{ status: 'failed', error }` for a failure known before any text arrives (unreachable, model not found); or `{ status: 'aborted' }`. A failure *during* the stream (Ollama drops mid-answer) surfaces by the generator throwing a typed error object, since some text may already have been handed to the caller and cannot be un-shown, the same shape `readNdjson` already uses for a stream that ends abruptly. Citations are read from a second, resolved-once-the-stream-ends property (`citations()`), available only after the generator is fully drained, because a marker can be split across chunks and only the complete text can be scanned reliably.

4. **Citation parsing.** A marker is `\[(\d+(?:,\s*\d+)*)\]` (one or more passage numbers, comma-separated, e.g. `[2]` or `[1, 3]`) scanned once over the joined, complete answer text. Each number is looked up against the passages given to the call, by their position in that numbered list (1-based, matching the prompt); a number outside that range is dropped silently, per the spec, and never matched to the nearest valid one. The result is a flat, ordered list of `Citation` (`passageIndex`, the passage's own `chunkId` and `locator`, and the character offset in the answer text where the marker appeared, so a later screen can place a footnote). Numbering restarts at 1 for every call, tied to that call's passage order, not any global chunk id. _Alternative: ask the model to output structured JSON with the answer, rejected: current local 8B instruction-following reliably produces bracket markers in free text but is markedly less reliable at producing valid JSON around prose it is also composing._

5. **Nothing relevant, no call.** `generateAnswer` takes the retrieval `verdict` directly (not passages plus a separately recomputed check), so "don't call Ollama" is a plain early return, not a duplicated relevance judgement. For that path it returns `{ status: 'ok', chunks: <a generator yielding the one fixed string, in English or French per the caller's language, then ending>, citations: () => [] }`, so callers do not need a separate branch for "no call was made" versus "a call was made and streamed": both are the same shape to consume.

6. **Fixed reply wording lives in i18n, not in this module.** The module takes the already-resolved string as a parameter (or, more precisely, the language, resolving via the same `t()` mechanism other screens use) rather than owning English/French text itself, since no other `src/lib/*` module (ingest, ollama, indexing, retrieval) contains display copy; that boundary stays. The spec's "plain fixed reply" requirement is met by a message key `answering.nothingFound` in `src/lib/i18n/messages.ts`, exercised by this change's own tests via the same `t()` used elsewhere, even though there is no screen yet.

7. **Tests and fakes.** The simulated Ollama gains `POST /api/chat` returning ndjson lines built from a given script (text chunks, an error line, a stall, a drop-after-N-chunks), plus a deterministic default (echoes the question with a citation to passage 1, so an un-scripted test still gets a plausible, parseable answer). Unit tests cover: passages appear in the prompt; chunks arrive in order and join to the full text; each marker shape (`[1]`, `[1, 2]`, an out-of-range number, malformed brackets); nothing called for `nothing-relevant`; each typed failure, including mid-stream; abort before and during the stream; only the configured address is contacted; nothing is written (reusing the harness pattern from indexing/retrieval tests, a spy library that records writes). A manual, environment-guarded test (`real-answer.manual.test.ts`) asks the real chat model real questions built from the passages the `passage-retrieval` real-world measurement already found for the real Pride and Prejudice, and prints the streamed answer and its resolved citations for a person to read, per the README's stance that citation/answer quality is a manual judgement.

## Risks / Trade-offs

- [A citation number can point to the right passage without the sentence near it actually being supported by that passage: the model can mis-cite within the offered set] → Out of reach of a mechanical check; the citation still resolves to a real, exact locator the reader can check by eye, which is the app's whole verifiability premise. The real-world check reads several answers to see how often this happens in practice.
- [Local 8B model instruction-following on the marker format is unproven] → The real-world check is exactly this test, with real questions; a markedly unreliable model here would be a design issue to revisit, not silently absorbed.
- [A stream that stalls indefinitely (Ollama accepts the connection but never sends `done`)] → `readNdjson` has no built-in timeout; this module adds one scaled to how long a local chat answer may reasonably run, as a named constant, separate from the embedding timeout (chat answers are typically much shorter than a batch-embedding wait).
- [Citations are resolved only after the whole stream ends, so a very long answer delays them] → Accepted: resolving per-chunk needs a marker-spanning-chunks parser, which is real added complexity for no benefit yet, since there is no screen to show a citation as it appears.
- [`/api/chat`'s exact streaming JSON shape for errors mid-stream has not been observed against a real Ollama the way `/api/pull`'s was] → The real-world check specifically watches for this; `classifyChatError` follows the same wording-matching pattern as `classifyPullError` and `classifyEmbedError`, updated if reality differs.

## Migration Plan

None. No stored data or storage format changes.

## Open Questions

None. The prompt wording itself (beyond the numbered-citation instruction already decided) is an implementation detail refined during tasks 1–2 and checked against real behaviour in task 3; it does not change the spec, the citation mechanism, or the task breakdown.

## Real-world check (the user's Ollama 0.34.0, real `llama3.1:8b` and `bge-m3`, real Pride and Prejudice)

Reused the vector cache from `passage-retrieval`'s real measurement (chapters I to XIII, 100 chunks, already indexed with `bge-m3`); no re-embedding of the book was needed.

**A full question worked correctly end to end.** "Who has taken Netherfield Park?" retrieved a `relevant` verdict (score 0.5323, matching the earlier measurement), and the real chat model answered "A young man of large fortune from the north of England[1]." in 22.2 seconds once warm, with one citation that resolved to chapter I, "Chapter I." — the correct chapter. This confirms the `[n]` marker mechanism works against the real model: it wrote a well-formed marker, referred to an offered passage, and the resolved locator was right.

**Found: cold model load, twice measured, informed `CHAT_STREAM_TIMEOUT_MS`.** A cold `llama3.1:8b` (about 4.9 GB) took 252 and 327 seconds on two separate runs to answer one word; a plain, non-streaming request outside this codebase (Python) confirms Ollama itself really does take that long here, not a bug in `streamChat`. The timeout was raised from the original 120 s to 600 s (10 minutes) to comfortably cover this, since every piece of text received still resets the timer, so a genuinely slow but working answer is never cut short once it has started.

**Found and not fixed here: this machine cannot hold both models loaded at once, so every question reloads one of them.** The machine has 14 GB of RAM with about 5 GB free; `llama3.1:8b` (about 4.9 GB) and `bge-m3` (about 1.2 GB) do not comfortably fit alongside everything else running. Retrieval's embedding call and generation's chat call use different models, so each question's turn (embed the question, then generate the answer) forces Ollama to evict one model to load the other, and the next question forces it back: a repeated cold load, not a one-time warm-up cost. This is a real constraint for a memory-constrained machine, consistent with the README's own "first message after idle reload takes a few seconds longer" trade-off, except here every turn pays it, not only the first. It is a resource-management concern for the eventual Ask-mode conversation (for example, a longer or explicit `keep_alive`, or accepting the reload as part of the turn's wait state), not something `answer-generation` itself should solve; it is recorded here for that later design to take into account.

**Found: Node's own `fetch` (undici) has a roughly 300-second default body timeout that is not part of this codebase and does not apply to the real app.** Running this manual test under Node, a cold load that takes longer than about 300 seconds fails with a generic "fetch failed" from Node itself, before `streamChat`'s own 600-second timer gets a chance to apply. A plain Python HTTP client, and the real Tauri/browser app `fetch` this product actually runs on, have no such ceiling. Pre-warming the chat model with a non-Node client (Python) immediately before starting the Node-based test let the first question complete cleanly (as above); the second question then hit the same repeated-reload finding above, again past Node's own ceiling, stopping the run at one completed question. This is a limitation of checking a multi-minute cold load from inside a Node test, not a defect in `streamChat` or a limit real readers will hit.

**Conclusion.** The citation mechanism is confirmed against the real model on the one question that completed; the two findings above (the raised timeout, and the model-swap cost on constrained memory) are recorded rather than fully re-verified across all five prepared questions, for the reasons given.

