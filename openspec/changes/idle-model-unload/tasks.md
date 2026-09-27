# Tasks

## 1. Setting and requests

- [ ] 1.1 Add `IDLE_UNLOAD_DEFAULT`, `IDLE_UNLOAD_CHOICES` and `keepAliveFor` to `src/lib/ollama/defaults.ts`, and `idleUnload` to `Settings` with validation in `parseSettings` (design decision 2); verify with settings tests: default when absent, each choice kept, an unknown value dropped, and `keepAliveFor` tests for each choice
- [ ] 1.2 Add `keepAlive` to the Ollama client and send it as `keep_alive` from `streamChat` and `embedTexts` only when set (design decision 1); verify with chat and embed tests that the body carries it when set and has no `keep_alive` when not
- [ ] 1.3 Pass `keepAliveFor(settings.idleUnload)` from the controller through `services.createClient`, and add `setIdleUnload`; verify with a new `controller.idle.test.ts` that an answer, a claim, indexing and the hardware check all send the saved keep-alive, that changing the setting applies to the next request, and that changing it sends nothing
- [ ] 1.4 Run `pnpm exec vitest run src/lib` and `pnpm lint`, then commit ("Send the idle unload time with every model request")

## 2. Interface

- [ ] 2.1 Add the English and French messages for the control, its four choices and its hint; verify with the existing i18n key-parity test
- [ ] 2.2 Create `IdleUnload.svelte` and show it on the landing screen under "Import a book" (design decision 3); verify with a component test: current choice shown, changing it saves the setting, label and choices in French
- [ ] 2.3 Run `pnpm exec vitest run` and `pnpm lint`, then commit ("Add the idle unload control to the main screen")

## 3. End to end

- [ ] 3.1 Add `e2e/idle-unload.spec.ts` against the mocked Ollama: the default sends `"10m"` on chat and embed requests; choosing 5 minutes sends `"5m"` on the next question; the choice survives a reload; keyboard-only change; verify with `pnpm exec playwright test`
- [ ] 3.2 Commit ("Add idle unload e2e tests")

## 4. Real-world check and wrap-up

- [ ] 4.1 In the real app against the local Ollama, ask a question with the default and read `/api/ps`: the chat model's `expires_at` is about 10 minutes ahead; choose 5 minutes, ask again, and check it is about 5 minutes ahead; choose Never and check it no longer expires soon. Record the readings in this change's design.md; verify the notes are written
- [ ] 4.2 Update the README Status section to say models unload after the chosen idle time; verify with markdownlint
- [ ] 4.3 Add the new French messages to the deferred French review memory file (`french-indexing-text-review-deferred.md`), then commit ("Finish idle-model-unload")
