# Design

## Context

The onboarding flow is a pure decision function, `decideScreen(input: ScreenInput): Screen` (`src/lib/onboarding/screens.ts`), driven by `OnboardingController` (`src/lib/onboarding/controller.svelte.ts`). `runCheck()` already calls `checkSetup` for Ollama/model readiness and, once `readiness.step === 'ready'`, calls `ensureIndexNeed()` to work out whether the active book needs indexing. Each screen is its own component (`GetOllamaScreen.svelte`, `IndexingScreen.svelte`, etc.), rendered by a flat `{#if controller.screen === ...}` chain in `App.svelte`. Settings (`src/lib/storage/settings.ts`, `Settings`/`LocalStorageSettings`) already remember confirmed model names and the active book across launches, in `localStorage`, tolerant of missing/blocked storage. Model installation checking (`model-provisioning`, `src/lib/ollama/models.ts`) only calls `GET /api/tags`, which does not load a model into memory - so, for a reader who has never imported a book, nothing before book import currently makes a real inference request that would let Ollama report GPU usage. See proposal.md for the motivating measurement.

## Goals / Non-Goals

**Goals:**

- One small, deliberate request to the required embedding model (not the large chat model, not a new download) to read whether Ollama used a GPU for it.
- Fold the result into the existing, pure `decideScreen` the same way `index`/`importPostponed` already are - no parallel decision path.
- Remembered once resolved (accelerated, or the warning acknowledged), so an accelerated machine never re-checks and a warned reader never re-clicks.

**Non-Goals:**

- Detecting *which* GPU, how much VRAM, or predicting the large chat model's own behavior precisely. The embedding model's GPU usage is a fast, imperfect proxy, not a guarantee (Risks below).
- Blocking the flow. This is advisory, and the only enforcement is the reader's own read of the warning.
- Any change to Ask mode, retrieval or generation. Those already handle a slow or failing Ollama on their own terms.

## Decisions

1. **A new small module does the check, not the existing `embedTexts`.** `embedTexts` (`src/lib/indexing/embed.ts`) is built for indexing's batch/timeout/progress needs and returns only vectors - it has no reason to read `/api/ps`. A new function, `checkAcceleration(client, model, signal?)`, makes one `POST /api/embed` request for a short fixed string, then one `GET /api/ps`, and reads the matching entry's `size_vram` against its `size`. `size_vram > 0` is `accelerated`; a clean answer with `size_vram === 0` (or no matching entry) is `not-accelerated`; anything else (Ollama unreachable, the request fails, the response is missing the field) is `inconclusive`. No retry, no classification into detailed error codes: per the spec, every non-`accelerated`/`not-accelerated` outcome is treated identically (proceed, do not block), so a richer error type would be unused.

2. **`Screen` gains `'hardware-warning'`; `ScreenInput` gains `hardwareCheck: 'unknown' | 'accelerated' | 'not-accelerated' | 'inconclusive' | 'skip'`.** In `decideScreen`, within the existing `case 'ready':` branch, before the `index`/`import` checks (matching the delta spec's ordering):
   ```ts
   if (input.hardwareCheck === 'unknown') return 'checking';
   if (input.hardwareCheck === 'not-accelerated') return 'hardware-warning';
   // 'accelerated' | 'inconclusive' | 'skip' all fall through, unchanged from today
   ```
   `decideScreen` stays a pure function with no knowledge of settings or persistence, exactly like `importPostponed` today.

3. **The controller resolves `hardwareCheck` the same way it resolves `index`.** A new private `ensureHardwareCheck()`, called from `runCheck()` right after `ensureIndexNeed()` when `readiness.step === 'ready'`: if `this.settings.hardwareCheckResolved` is already true, sets `hardwareCheck = 'skip'` without any request; otherwise calls `checkAcceleration` and sets `hardwareCheck` to its result, saving `hardwareCheckResolved: true` only on `'accelerated'` (an `'inconclusive'` result is retried on the next launch, since the machine's real status is still unknown). A new public `acknowledgeHardwareWarning()` (called by the new screen's "Continue anyway" button) saves `hardwareCheckResolved: true` and sets `hardwareCheck = 'skip'` at once, so the flow moves on immediately without waiting for the next `runCheck()`.

4. **`Settings` gains `hardwareCheckResolved?: boolean`**, alongside the existing optional fields, following the same `parseSettings` tolerance-of-garbage pattern as the rest of the interface.

5. **`HardwareWarningScreen.svelte`, one more entry in `App.svelte`'s screen chain**, following the existing one-component-per-screen pattern. Heading ("This computer will likely be very slow at this"), one explanatory paragraph, and a single "Continue anyway" button calling `acknowledgeHardwareWarning()`. No error styling (this is not a failure state), matching the calm tone of the rest of onboarding. The paragraph's wording was strengthened after the real first-run check below, at the user's request: an initial "several minutes each" draft read as a minor inconvenience rather than the severe, sometimes ten-minutes-or-more (and occasionally non-finishing) reality this session measured directly, so the final wording names that duration and explicitly says "really slow, not just a little slower."

## Risks / Trade-offs

- [The embedding model's GPU usage is a proxy, not a direct measurement of the chat model's own behavior; a machine could offload the small embedding model but still fail to fit the much larger chat model, giving a false "accelerated" read] → Accepted for this change: a perfect predictive signal would need loading the actual chat model, which is exactly the slow operation this check exists to avoid before the reader has committed to anything. The proxy is honest about what it measures if it needs a details/explanation surface later; today's one-line message is deliberately about "local AI" in general, not a specific promise about the chat model.
- [A reader on a genuinely slow but *technically* accelerated machine (e.g. a very small, shared GPU) never sees the warning, since `size_vram > 0` is the whole bar] → Accepted: the real measurement backing this change was a stark accelerated-vs-not gap (15.6s vs 250-800+s), not a graded one; refining the threshold needs more real data than this change has, and a false negative here is no worse than today's total silence.
- [Persisting resolution means a reader who upgrades their hardware, or fixes a broken GPU driver, keeps seeing (or not seeing) a stale verdict] → Low-consequence either way: a stale "resolved, no warning" on improved hardware costs nothing (the machine really is fine now); a stale "resolved, acknowledged" on unchanged-or-worse hardware just means one fewer reminder of something already told once. Not worth a manual reset control for a first version.

## Migration Plan

None. `hardwareCheckResolved` is a new optional `Settings` field; its absence (every existing install) means "not yet resolved," so the check simply runs once on the next launch, exactly like a fresh install.

## Real-world check (the user's Ollama 0.34.3, real `bge-m3`, this dev machine, confirmed CPU-only all session)

Driven in the browser against `pnpm dev` and the real Ollama. With existing saved settings (language, an active book) but no `hardwareCheckResolved` yet, a fresh load correctly showed the warning screen before reaching the landing screen. Clicking "Continue anyway" moved straight to the landing screen and saved `hardwareCheckResolved: true`, alongside every other setting unchanged (confirmed by reading `localStorage` directly). Reloading afterward landed directly on the landing screen with no warning and no repeated check, confirming the once-per-install behavior end to end. This was fast, as expected: the check uses only `/api/embed` and `/api/ps`, never the slow chat model.

**Not confirmed live: the accelerated path (the warning correctly not appearing when Ollama does report GPU offload).** This dev machine has no GPU Ollama can use, so it cannot demonstrate that path itself, and the GPU-equipped second machine from `ask-mode-screen`'s own real-world check was not available during this session to re-run through this specific new code. That path rests on its unit and end-to-end test coverage (both explicitly simulate `size_vram > 0`) rather than a live confirmation. Recorded here rather than left unstated.

**5.3: confirmed in the real `pnpm tauri dev` window, with wording feedback acted on.** The screen and its button worked correctly in the native window (the user had to close and manually restart the window once to see it, on the very first run - not reproduced or investigated further, and not necessarily related to this change, since it did not recur). The user's wording feedback: the original draft ("answers will likely take several minutes each, rather than seconds") undersold the real severity they had directly experienced on this machine earlier in the session (cold answers taking 250-800+ seconds, sometimes failing outright) - a reader could read "several minutes" as "a bit slower" rather than the dramatically, sometimes non-functionally slower reality. The wording was strengthened to name the real measured duration ("sometimes ten minutes or more"), name that it can fail to finish, and say explicitly "expect it to be really slow, not just a little slower," in both English and French; all references to the old wording (component test, e2e spec, the spec delta, the proposal, this document) were updated to match.
