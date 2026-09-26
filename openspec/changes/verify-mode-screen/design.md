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

## Migration Plan

No stored data changes. Rollback is reverting the change; nothing saved needs cleanup.
