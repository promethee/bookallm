# Design

## Context

- The landing screen (`src/components/LandingScreen.svelte`) shows the Ask mode disclosure line, the active book card, the import action and, for a ready book, `AskConversation.svelte`. There is no notion of a current mode yet.
- All Ask mode state lives in `OnboardingController` (`src/lib/onboarding/controller.svelte.ts`): `turns`, `askBusy`, `askAbort`, and the actions `askQuestion`, `stopAnswer`, `retryTurn`. `turns` is cleared in three places where the active book changes (import, duplicate answer, book switch).
- `generateClaim` (`src/lib/mutation/generate.ts`) takes the loaded `Book` (with its chunks), the chat model, a client, `excludeChunkIds` and a signal, and returns a typed `MutationResult`. It never throws. It needs the book's chunks only, not its vectors.
- Announcements go through the controller's `announce(key)` and `LiveRegion.svelte`.
- Measured on this CPU-only machine, one claim took 822s and 1403s. The GPU machine at `192.168.0.66` (reachable, `llama3.1:8b` and `bge-m3` both present, fully GPU-resident) is where the real-world check runs.

## Goals / Non-Goals

**Goals:**

- Verify mode state and actions follow the same pattern as Ask mode's, in the same controller, so both are tested the same way (controller tests with the shared harness, component tests, e2e against the mocked Ollama).
- No change to `claim-mutation`: the screen consumes its public API as is.

**Non-Goals:**

- The claim's language. The claim is written in the book's language, like its source passage, not translated to the interface language: the reader compares it to that passage, so matching languages makes the check fair. Only the surrounding interface text (buttons, verdict, changed-attribute names) is translated.
- Persisting the mode, the claim or the tally.
- Tuning mutation quality or `MUTATION_VERIFY_RETRIES`. The real-world check records what it sees; changing prompts is a separate change if needed.

## Decisions

### 1. Mode and Verify state live in `OnboardingController`

`mode: 'ask' | 'verify'` is plain `$state`, defaulting to `'ask'`, never saved. Verify state is one `$state.raw` object: `{ state: 'idle' | 'generating' | 'ready' | 'revealed' | 'failed'; claim?: MutationClaim; guess?: boolean; error?: MutationError }`, plus `verifyTally: { judged: number; correct: number }`, a private `usedChunkIds: string[]` and a private `verifyAbort`. Actions: `setMode`, `requestClaim`, `stopClaim`, `judgeClaim(guess)`, `retryClaim` (the same as `requestClaim`, named for the failure path).

Alternative: a separate Verify controller. Rejected: the book, settings, client factory, announcer and "clear on book change" hooks all already live in `OnboardingController`, and Ask mode set the precedent.

### 2. One reset for everything session-scoped per book

The three places that set `this.turns = []` call a new private `resetBookSession()` that also aborts any claim being generated, resets the Verify state to idle, zeroes the tally and empties `usedChunkIds`. This keeps "clears when the book changes" true for both modes by construction rather than by remembering three call sites.

### 3. Used passages are excluded; when all are used, start over once

On a successful claim, its `citation.chunkId` is added to `usedChunkIds`, which is passed as `excludeChunkIds`. If `generateClaim` returns `no-chunks-available` while `usedChunkIds` is not empty, the controller empties the list and calls it once more. A book with no chunks at all still fails with the typed error (shown as the generic failure message). Stopped and failed claims do not mark their chunk as used: nothing was shown.

Alternative: let the failure surface to the reader. Rejected: "you have seen every passage" is not something the reader can act on, and books have hundreds of chunks, so this only matters for tiny test books.

### 4. Tabs follow the WAI-ARIA tabs pattern

A `role="tablist"` with two `role="tab"` buttons (`aria-selected`, `aria-controls`), roving `tabindex` and Left/Right arrow keys, and a `role="tabpanel"` for the current mode. Selecting a tab switches immediately (no separate activation). Both panels stay mounted state-wise because state is in the controller; only the visible panel renders.

### 5. Visual distinction by color token and layout

Ask mode keeps its indigo disclosure line. Verify mode uses amber for its disclosure line, selected tab and claim card, and presents the claim as a single large card with the two choices below it, unlike Ask mode's question field and stacked turns. Colors use the existing Tailwind palette; no new design tokens.

### 6. The reveal names the changed attribute in plain words

`changedAttribute` maps to translated phrases ("the cause", "the order of events", "who did or said it", "where it happened"). The exact changed words are not highlighted: the pipeline does not return a diff, and making the reader find it in the passage is the point.

### 7. Generation keeps running across tab switches

Switching tabs does not abort anything. Ollama queues concurrent requests, so asking a question while a claim is being generated just waits longer; the existing "getting ready" note covers that wait.

## Risks / Trade-offs

- [A claim takes minutes on a CPU-only machine] → The waiting note and stop action, plus the existing hardware warning, set the expectation. The real-world check on the GPU machine measures the good case.
- [Remote Ollama rejects the app's origin] → Ollama's default allowed origins include `localhost` and `tauri://` origins, which cover `pnpm dev` and the Tauri webview. If the check hits a CORS error, the GPU machine needs `OLLAMA_ORIGINS` set; this is setup, not a code change.
- [Unverified claims are frequent on real text] → Shown as a plain "could not make a fair claim" failure with a retry, never as a wrong claim. The real-world check records how often this happens.
- [Tally only counts judged claims] → Stopped and failed claims are invisible in the score, which is intended: the reader did not get to judge them.

## Real-world check (2026-09-27)

Run in the real app (`pnpm dev` in a browser) against a local Ollama on the GPU machine (RTX 3060 12 GB, `llama3.1:8b` fully GPU-resident), with *Candide* (Project Gutenberg #19942, English, 72 sections) imported and indexed in under two minutes. Times are from the click on "Give me a claim", "Next claim" or "Try again" to the claim or failure appearing.

| Attempt | Outcome | Time |
| --- | --- | --- |
| 1 | Unverified (includes a 55 s cold load of the chat model) | 165.9 s |
| 2 | True claim, judged right | 2.0 s |
| 3 | Unverified | 5.6 s |
| 4 | Other failure: the model answered `ATTRIBUTE: age`, not one of the four kinds | 4.5 s |
| 5 | Changed claim ("company of horse" for "of foot"), judged right | 4.2 s |
| 6 | True claim, judged right | 3.1 s |
| 7–10 | Unverified, four in a row | 4.2–5.1 s |
| 11 | True claim, judged wrong on purpose ("Not this time", tally 3 of 4) | 4.0 s |
| 12 | True claim, from the edition's Introduction, judged right | 2.5 s |

- **Time per claim:** 2–6 s once the model is loaded; the first request after a cold start took almost 3 minutes, which the "getting ready" note covers.
- **Unverified:** 6 of 12 attempts (50 %), plus 1 parse failure. Each was shown as the plain failure with a working retry, never as a wrong claim.
- **True and changed both appeared,** but unevenly: 4 true, 1 changed. Since true claims skip verification, the unverified failures are likely all changed-claim attempts, which skews what the reader sees toward true claims.
- **Mislabelled change:** the one changed claim swapped "foot" for "horse" but was labelled "the order of events", so the reveal named the wrong attribute.
- **Front matter:** one claim came from the translator's Introduction, not the story.
- **Screen:** tabs, waiting note, claim card, both verdicts, changed-attribute line, source passage with chapter, tally, failure messages and retry all behaved as specified. Cosmetic: Gutenberg passages begin with the chapter title, so it shows twice under "From the book".

The screen works as designed. The unverified rate, the true/changed skew, the attribute label and front-matter passages are claim-mutation quality issues, out of scope here (see Non-Goals), for a follow-up change.

## Migration Plan

No stored data changes. Rollback is reverting the change; nothing saved needs cleanup.
