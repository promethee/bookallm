# Tasks

## 1. Foundations

- [ ] 1.1 Define the types in `src/lib/ollama/types.ts` (statuses, model requirements, download plan, progress events, pull result and error codes, readiness result, client options); verify `pnpm typecheck` passes
- [ ] 1.2 Add the defaults in `src/lib/ollama/defaults.ts` (base URL, default model names, approximate sizes, detection timeout); verify `pnpm typecheck` passes
- [ ] 1.3 Write test helpers in `src/lib/ollama/testing/`: a fake-`fetch` builder that returns JSON or streamed newline-delimited bodies, and a local HTTP server helper (`node:http`) that can send chunks, delay, and drop; verify a helper test reads a streamed body back with lines split across chunks
- [ ] 1.4 Confirm the minimum Ollama version and the official download addresses against Ollama's release notes and download pages, and record the sources in code comments; verify the constants match what was found
- [ ] 1.5 Commit checkpoint: "Add Ollama setup types, defaults and test helpers"

## 2. Detection

- [ ] 2.1 Implement version parsing and comparison; verify tests for suffixes such as `-rc1`, equal versions, and lower and higher versions
- [ ] 2.2 Implement `detectOllama` with the time limit and the not-Ollama cases; verify tests for `ready`, `outdated`, refused connection, non-200, invalid JSON, missing `version`, and a connection that never answers
- [ ] 2.3 Verify a custom base URL is used for detection and later requests, and that only read requests are made
- [ ] 2.4 Implement `installGuidance`; verify tests for each platform and the unknown-platform fallback
- [ ] 2.5 Commit checkpoint: "Add Ollama detection"

## 3. Model checking and planning

- [ ] 3.1 Implement model-name normalisation and the installed-list read; verify tests for `bge-m3` vs `bge-m3:latest`, case, and `llama3.1:8b` vs `llama3.1:70b`
- [ ] 3.2 Implement `checkModels` reporting each required model as installed or missing, with a read failure as an `unreachable` error; verify tests for the partly-set-up case and a failed listing
- [ ] 3.3 Implement `planDownloads`; verify tests for only-missing models, unknown sizes left out of the total, an empty plan, and that no request beyond the list is made
- [ ] 3.4 Commit checkpoint: "Add model checking and download planning"

## 4. Pulling models

- [ ] 4.1 Implement the newline-delimited stream reader that survives lines split across chunks and a missing trailing newline; verify tests against the local HTTP server
- [ ] 4.2 Implement progress aggregation across parts and the phase mapping, keeping the last phase on unknown status text; verify tests for multi-part sums, the fraction, and repeated progress events
- [ ] 4.3 Implement `pullModel` success, plus `cancelled` on abort without deleting anything; verify tests for success, a cancel mid-stream, and a second pull after cancelling
- [ ] 4.4 Implement failure mapping (`unreachable`, `model-not-found`, `insufficient-disk-space`, `pull-failed`), including an error line inside a 200 response and a dropped connection; verify one test per code
- [ ] 4.5 Commit checkpoint: "Add model pulling"

## 5. Orchestration

- [ ] 5.1 Implement `pullMissingModels` (sequential, skips installed, names the model in progress, stops at the first failure or cancellation); verify tests for both missing, one installed, and stop-on-failure
- [ ] 5.2 Implement `checkSetup` with the fixed step priority and no caching; verify a test per step, the disappears-while-checking case, and repeat checks reflecting new state
- [ ] 5.3 Verify a substituted model name and a custom address flow through detection, checking, planning and pulling
- [ ] 5.4 Export the public API from `src/lib/ollama/index.ts`; verify `pnpm typecheck` and `pnpm lint` pass
- [ ] 5.5 Commit checkpoint: "Add Ollama setup readiness"

## 6. Real Ollama check

- [ ] 6.1 Add an opt-in test, enabled by `OLLAMA_URL`, that runs detection and readiness against a real server and prints the results; verify `pnpm test` still passes with the variable unset
- [ ] 6.2 With the user's approval, start the local Ollama server, run the opt-in test, and confirm the real readiness result (this machine has `bge-m3` but not `llama3.1:8b`, so `pull-models` is expected); then stop the server and record the result
- [ ] 6.3 With the user's approval of one small model's name and size, run a real pull of it through `pullModel` and confirm progress, then a cancel and resume; record the result. Skip if the user declines
- [ ] 6.4 Commit checkpoint: "Add real Ollama check"

## 7. Wrap-up

- [ ] 7.1 Verify `pnpm check` passes end to end
- [ ] 7.2 With the user's approval to push, verify CI is green on the pushed branch
- [ ] 7.3 Commit checkpoint: "Finish ollama-setup", then archive the change
