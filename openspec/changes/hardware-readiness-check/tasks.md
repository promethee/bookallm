# Tasks

## 1. The acceleration check

- [x] 1.1 Add `checkAcceleration(client, model, signal?)` (a new small module, e.g. `src/lib/hardware/`): one `POST /api/embed` request for a short fixed string, then one `GET /api/ps`, reading the matching entry's `size_vram` against `size`; returns `{status: 'accelerated'}`, `{status: 'not-accelerated'}` or `{status: 'inconclusive'}` (Ollama unreachable, the request fails, the response is missing the expected field, or no matching `/api/ps` entry), and never throws
- [x] 1.2 Verify unit tests (a fake Ollama, reusing the existing `fake-fetch`/`createFakeFetch` testing helpers) cover: full GPU offload (`size_vram === size`) is `accelerated`; `size_vram === 0` is `not-accelerated`; a refused connection, a failed embed request, and a `/api/ps` response missing the model are each `inconclusive`; an aborted signal ends the check without a result
- [x] 1.3 Add `hardwareCheckResolved?: boolean` to `Settings` (`src/lib/storage/settings.ts`) and its `parseSettings` handling, and verify a settings round-trip test covers it defaulting to absent/falsy and surviving a save/load cycle
- [x] 1.4 Commit checkpoint: "Add the hardware acceleration check"

## 2. Screen decision and controller wiring

- [ ] 2.1 Add `'hardware-warning'` to the `Screen` union and `hardwareCheck: 'unknown' | 'accelerated' | 'not-accelerated' | 'inconclusive' | 'skip'` to `ScreenInput` (`src/lib/onboarding/screens.ts`), and insert the new priority step in `decideScreen`'s `case 'ready':` branch before the existing `index`/`import` checks, and verify `decideScreen` unit tests cover: `'unknown'` going to `checking`, `'not-accelerated'` going to `hardware-warning`, and `'accelerated'`/`'inconclusive'`/`'skip'` all falling through to today's existing behavior unchanged
- [ ] 2.2 Add `ensureHardwareCheck()` (private, called from `runCheck()` right after `ensureIndexNeed()` when readiness is `ready`: skips the request entirely and sets `hardwareCheck = 'skip'` if `settings.hardwareCheckResolved` is already true; otherwise calls `checkAcceleration` and sets `hardwareCheck` to its result, saving `hardwareCheckResolved: true` only on `'accelerated'`) and `acknowledgeHardwareWarning()` (public: saves `hardwareCheckResolved: true` and sets `hardwareCheck = 'skip'` at once) to `OnboardingController`
- [ ] 2.3 Verify controller tests with a fake Ollama cover: a not-accelerated machine reaching the `hardware-warning` screen; an accelerated machine skipping straight through and `hardwareCheckResolved` being saved; an inconclusive result also skipping through but `hardwareCheckResolved` staying unsaved (so a later `runCheck()` retries it); a machine with `hardwareCheckResolved` already saved never calling `checkAcceleration` at all; and `acknowledgeHardwareWarning()` moving the screen on immediately without waiting for another check
- [ ] 2.4 Commit checkpoint: "Wire the hardware check into the onboarding flow"

## 3. The warning screen

- [ ] 3.1 Add English and French messages for the warning's heading, its explanation ("this machine doesn't appear to accelerate local AI; answers will likely take several minutes each rather than seconds", in the project's plain, dash-free wording), and the "Continue anyway" button, and verify the language table parity test passes and no message uses an em dash
- [ ] 3.2 Add `HardwareWarningScreen.svelte` (heading, explanation paragraph, one button calling `acknowledgeHardwareWarning()`, no error styling) and wire it into `App.svelte`'s screen chain, and verify component tests cover the screen rendering its text and the button moving on to the next screen
- [ ] 3.3 Verify component tests cover keyboard reachability of the button and the same flow in French
- [ ] 3.4 Commit checkpoint: "Add the hardware warning screen"

## 4. End to end

- [ ] 4.1 Add `size_vram`/`size` control to the Playwright Ollama mock's `/api/ps` and `/api/embed` handling (reusing the existing mock's shape), and verify a Playwright test drives a not-accelerated machine through the warning screen to "Continue anyway" and confirms the next screen (book import) is reached
- [ ] 4.2 Add Playwright tests for: an accelerated machine never showing the warning; the warning not reappearing after a reload once acknowledged; and a different, still-unaccelerated book import path being unaffected (the warning only ever appears once per install, not per screen visit)
- [ ] 4.3 Commit checkpoint: "Add hardware check end-to-end tests"

## 5. Real-world checks

- [ ] 5.1 Drive the running app in the browser against the real Ollama on this (confirmed non-accelerated) dev machine: confirm the warning screen appears once models are ready, before book import, with the expected wording, and that "Continue anyway" proceeds normally and is not shown again on reload; record the result
- [ ] 5.2 Note in design.md whether the accelerated path was also confirmed live (this machine cannot demonstrate it; reuse of the earlier cross-machine benchmark data, or a fresh run on the GPU machine from that session, is acceptable evidence if available) or rests on its test coverage alone
- [ ] 5.3 With the user, run `pnpm tauri dev` and confirm the warning screen and its button work in the real window; record the result
- [ ] 5.4 Ask the user to skim the new French text and record any corrections
- [ ] 5.5 Commit checkpoint: "Record real-world hardware check results"

## 6. Wrap-up

- [ ] 6.1 Update the README status, verify `pnpm check` passes end to end, and verify `openspec validate hardware-readiness-check --strict` passes
- [ ] 6.2 With the user's approval to push, verify CI is green on the pushed branch
- [ ] 6.3 Commit checkpoint: "Finish hardware-readiness-check", then archive the change
