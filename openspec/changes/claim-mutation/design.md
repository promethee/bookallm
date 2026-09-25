# Design

## Context

The active book is already loaded as a `Book` (`src/lib/ingest/types.ts`), whose `chunks: Chunk[]` are the same chunks `passage-retrieval` searches and `answer-generation` cites - each with a stable `id`, its `text`, and a `ChunkLocator` (chapter, paragraph range, character range). No embedding call is needed to pick one: this is local selection over data already in memory, not a search. `answering/chat.ts` exports `streamChat(client, model, messages, options)`, a low-level "send messages to the configured chat model, stream text back" primitive already hardened by two real-world rounds of tuning on this project's own slow dev machine: a resettable inactivity timeout (`CHAT_STREAM_TIMEOUT_MS`), a bounded automatic retry for a connection dropped before any text arrives, and a request-scoped context window (`CHAT_CONTEXT_LENGTH`)/answer-length cap (`CHAT_MAX_ANSWER_TOKENS`). It returns `{status:'ok', chunks: AsyncGenerator<string>} | {status:'aborted'} | {status:'failed', error: AnswerError}`, where `AnswerError.code` is `'unreachable' | 'model-not-found' | 'chat-failed'`. See proposal.md for why this change exists and its scope boundary with the later Verify mode screen.

## Goals / Non-Goals

**Goals:**

- Reuse `streamChat` for every chat-model call this library makes, rather than reimplementing connection/timeout/retry handling that was already built and tuned for exactly this "send messages, get text back" shape.
- A result shape that mirrors `RetrievalResult`/`GenerateAnswerResult`'s own conventions (`ok`/`aborted`/`failed` with a typed error), so a future controller wiring this in feels the same as wiring in the other two.
- Never present a changed claim that was not actually confirmed to contradict its source.

**Non-Goals:**

- No screen, no i18n text, no session tally, no adaptive difficulty. Those belong to Verify mode's own future UI change.
- No new persistence. `excludeChunkIds` is a plain input the future screen/controller is responsible for tracking (session-only, the same way `ask-mode-screen`'s conversation itself is session-only); this library does not remember anything between calls.
- Not attempting to make the true/false coin flip cryptographically unpredictable - `Math.random`, injectable for tests, is enough for a study aid, not a security boundary.

## Decisions

1. **Three `streamChat` calls per successful claim: extract, mutate, verify - each with its own focused system prompt, not one call doing everything.** Splitting them lets a failed verification retry only the mutation step (regenerate a changed version from the same already-extracted true claim) instead of re-extracting the true claim every retry, and keeps each prompt's job small enough that a small local model has a real chance at it. Considered: one combined call producing both claim and mutation together, parsed from labelled lines (`TRUE: …` / `CHANGED: …`). Rejected for retries specifically - a failed verification would have no clean way to ask for "the same true claim, a different mutation" without re-sending the whole exchange as conversation history, which the existing `streamChat(client, model, messages)` shape supports (messages is just an array), but adds complexity for no real benefit over two separate, focused calls.

2. **`generateClaim(options)` drains `streamChat`'s generator internally and returns plain strings, not a stream.** A claim is a sentence or two; nothing here benefits from token-by-token delivery the way a long Ask-mode answer does. A future screen can still choose to fade in the final text however it likes - that is presentation, not this library's concern. Draining also means the same `AnswerError` a mid-drain throw carries maps directly to this library's own failure result, no separate mid-stream-vs-pre-stream distinction to expose (unlike `answering`, whose callers see partial text before a mid-stream failure; here there is no partial text worth keeping if extraction, mutation or verification is cut short).

3. **Chunk selection: uniformly random among the book's chunks not in the caller's `excludeChunkIds`, via an injectable `random?: () => number` (default `Math.random`), for deterministic tests.** No weighting by chunk length, position or anything else - the simplest rule that satisfies "a real chunk, not the same one repeated too soon," matching how little the proposal actually requires here. Retrying a failed verification keeps the same chunk (and its already-extracted true claim); only a fresh `generateClaim` call picks a new one.

4. **Verification is a real second model call, not trusting the mutation step's own output.** The README calls out a real calibration risk (too obvious and the reader stops checking; too subtle and it reads as a gotcha), and a model asked to "change one attribute" can sometimes produce a paraphrase that does not actually contradict the source. The verification prompt asks, plainly, whether the changed statement contradicts the passage, expecting a single-word answer; parsed tolerantly (matches on a `CONTRADICT`/`MATCH`-style pair of words the prompt requests, not strict JSON), the same lightweight-convention approach `answering/citations.ts` already uses for `[1]`-style markers over asking a local model for reliable JSON.

5. **`MUTATION_VERIFY_RETRIES` (mutation-regeneration attempts after the first, provisional default: 2) is a documented constant, not yet measured against a real model.** Unlike `CHAT_STREAM_TIMEOUT_MS` or `CHAT_CONTEXT_LENGTH`, which this project tuned from real measurements before settling their values, no real run of this specific pipeline exists yet. Tasks include a real-world check against the user's own Ollama that may lower or raise this default once actual verification-failure rates are observed; documented as provisional here rather than presented as measured when it is not.

6. **Result carries a fixed `difficulty: 'flat'` field.** README: "the data model reserves a difficulty field for future use, but no user-facing toggle until adaptive mode (v2) is actually built - a toggle with only one working option is dead UI." Reserving the field now, fixed to one value, avoids a breaking type change when adaptive difficulty eventually reads it; nothing in this change offers a toggle or varies it.

7. **Error codes: the three `streamChat` codes plus two of this library's own (`no-chunks-available`, `unverified`), no separate code for "extraction produced something unusable."** An extraction call that fails to produce a usable claim (e.g. empty text) is treated the same as any other `chat-failed`-shaped problem from that call - it is still "the chat step did not produce something usable," and a separate code would not change what a caller does differently with it (retry the whole `generateClaim` call, same as any other failure here).

## Risks / Trade-offs

- [A small local chat model may struggle with the "state one concrete, checkable claim" instruction on some passages - dense description with no clear cause/order/actor/place - producing something too vague to meaningfully mutate or verify] → Accepted for this library: it reports what it produces (or a typed failure if verification never confirms a contradiction), and does not itself judge claim quality beyond the contradiction check. A future screen calling `generateClaim` again for a different chunk is a cheap, caller-side mitigation; this library does not need its own retry-on-different-chunk logic to stay correct.
- [The verification call is itself a model call, and could be wrong in either direction: confirming a contradiction that is not really there, or missing one that is] → Accepted as the same class of risk every LLM-graded step in this project already carries (relevance verdicts, citation markers); not something a second-guessing third call meaningfully fixes, per the same reasoning `answer-generation`'s design already applied to citation markers.
- [`MUTATION_VERIFY_RETRIES`'s provisional value could be too low (discarding claims that would have verified on one more try) or too high (slow on a CPU-only machine, per this project's own hardware-readiness findings) before it is measured] → Documented as provisional (Decision 5); a real-world check task exists specifically to replace the guess with a measurement, the same process every other tuned constant in this project went through.

## Migration Plan

None. New library, no stored data, no schema.

## Open Questions

None. The exact wording of the three prompts (extraction, mutation, verification) is an implementation detail refined during tasks and checked against real model behaviour, the same way `answer-generation`'s own prompt wording was - it does not change the spec, the result shape, or the task breakdown.

## Real-world check (partial; the user's Ollama 0.34.3, real `llama3.1:8b`, cached `small-pride.epub`)

One real claim attempt, no cached vector needed (chunk selection is local). Result: `unverified` after 822.8 seconds (7 real chat calls: 1 extraction + `MUTATION_VERIFY_RETRIES` + 1 = 3 mutate/verify pairs, none confirmed). CPU-only throughout (`size_vram: 0`), consistent with this machine's already-documented constraints.

**Root-caused with a throwaway debug script** (printed each of the three calls' raw text, not just `generateClaim`'s final outcome): the model sometimes drops the requested `ATTRIBUTE:`/`CLAIM:` labels entirely, answering with a bare first line (e.g. `ORDER`) followed by the claim, no labels at all. The strict parser read that as unparseable, which - once every retry attempt also hit it, as they did in the original 822.8s run - meant no real mutation was ever produced for verification to confirm or reject; `unverified` was reported for a reason unrelated to the mutation's actual quality.

**Fixed and reconfirmed live.** `parseMutation` now falls back to reading a short unlabelled first line as the attribute when the strict labelled form is not there (`mutate.ts`). A second real run (1 claim) succeeded: `CHANGED (order)`, "The author has seen rather less of the world by the time of Emma's composition" against a source saying "the author had ... seen rather more of the world" - a real, correctly one-attribute change, genuinely contradicting the source, confirmed by the verification call. 1403.7 seconds for the one claim (extraction + one mutate/verify pass, CPU-only) - slow, consistent with this machine's documented constraints, but the pipeline works end to end.

Not yet re-run for the "true/changed split looks unpredictable across several claims" check (session time budget: each real claim costs 15-25+ minutes on this machine); the coin flip itself is unit-tested (Decision 3), and this real run only exercised the `isTrue: false` path once.
