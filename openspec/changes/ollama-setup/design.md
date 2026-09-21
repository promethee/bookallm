# Design

## Context

The scaffold and the ingestion core exist; nothing talks to Ollama yet. README fixes the defaults (`llama3.1:8b`, `bge-m3`), asks for a plain-language install walkthrough, and forbids silent multi-GB downloads. Motivation and scope: see proposal.md; behavior: see the three delta specs.

Observed on this machine (Ollama 0.34.0, started briefly for the check, then stopped):

- `GET /api/version` returns `{"version":"0.34.0"}`. `GET /api/tags` lists models with `name`, `size` and `capabilities`. Installed here: `bge-m3:latest` (1,157,672,605 bytes) but not `llama3.1:8b`, so a half-set-up machine is a real case.
- Every request answered with `Access-Control-Allow-Origin: *`, including preflights from `http://tauri.localhost`, `https://tauri.localhost`, `tauri://localhost` and `http://localhost:5173`.
- `POST /api/pull` streams newline-delimited JSON: `{"status":"pulling manifest"}`, then per-layer `{"status":"pulling <id>","digest":…,"total":N,"completed":M}`, then `verifying sha256 digest`, `writing manifest`, `success`.
- An unknown model still answers HTTP 200: the stream starts with `pulling manifest`, then `{"error":"pull model manifest: file does not exist"}`. Errors therefore arrive inside the stream.

## Goals / Non-Goals

**Goals:**
- A pure TypeScript module with an injectable `fetch`, testable in Node with fake servers and, optionally, against the real Ollama.
- Typed results for every expected outcome; nothing throws for an expected failure.
- One readiness result the onboarding screens can be driven from.

**Non-Goals:**
- Screens, wording, translations, settings persistence, the idle-unload timeout (a request-time option for the calls that use the models), starting or installing Ollama, checking that a model suits its role, and any Rust change.

## Decisions

1. **Module and API.** Code lives in `src/lib/ollama/`. `createOllamaClient({ baseUrl?, fetch?, timeoutMs? })` wraps the HTTP calls (`version`, `listModels`, `pull`). Higher-level functions take a client: `detectOllama`, `checkModels`, `planDownloads`, `pullModel`, `pullMissingModels`, `checkSetup`. The default base URL is `http://127.0.0.1:11434`; `fetch` defaults to the global one, which is what tests replace.
2. **Plain `fetch`, no Rust plugin.** The check above shows Ollama 0.34.0 allows the webview's origins, so no Tauri HTTP plugin, no Rust change and no long recompile are needed. Alternative kept in reserve: the Tauri HTTP plugin (one Rust line plus a capability entry), needed only if a reader's Ollama restricts origins. Its cost is a Rust rebuild of about 20 minutes.
3. **Version check.** `GET /api/version`, 3-second timeout (`AbortSignal.timeout`). A non-200 status, invalid JSON, or a body without a string `version` means `unreachable` (not Ollama). Versions parse as `major.minor.patch`, ignoring any pre-release or build suffix, and compare numerically. The minimum is `0.3.4`: Llama 3.1 needs only 0.3.0 (its release notes), but the embeddings endpoint (`/api/embed`) that later changes rely on is announced in the 0.3.4 release notes (2024-08-06; 0.3.3 already refers to it). Task 1.4 first assumed 0.3.0 and corrected it after reading the release notes.
4. **Model names.** Normalised by trimming, lower-casing and appending `:latest` when there is no tag. Comparison is exact on the normalised name, so `llama3.1:8b` does not match `llama3.1:70b`. The installed list comes from `GET /api/tags`; a failed read is `unreachable`, never "empty".
5. **Download plan.** Missing models with `approxBytes` from a small table for the defaults (`bge-m3:latest` 1,157,672,605 bytes measured here; `llama3.1:8b` about 4.9 GB from Ollama's library, marked approximate), and `undefined` for anything else. The total sums only the known sizes. Planning is a pure function of the installed list.
6. **Pull stream.** `POST /api/pull` with `{ model, stream: true }`. The response body is read as a stream and split on newlines across chunk boundaries (streaming text decoding with a carry-over buffer). Each line is handled by shape rather than by exact status text: a line with `error` fails the pull; a line with numeric `total` and `completed` updates a map keyed by `digest`, and progress is the sum over that map; `success` ends it; otherwise the status text picks the phase (`manifest`, `verifying`, `finalizing`). Unknown status text keeps the previous phase, so a wording change in a future Ollama does not break the flow. The total can grow as new parts appear, so the fraction is not promised to be monotonic.
7. **Cancellation.** The caller passes an `AbortSignal`. Abort resolves `{ status: 'cancelled' }` (an abort error is never a failure). Nothing is deleted; Ollama keeps partial layers and resumes them on the next pull, which is why "resume" needs no code beyond calling `pull` again.
8. **Errors.** `PullError = { code: 'unreachable' | 'model-not-found' | 'insufficient-disk-space' | 'pull-failed'; detail?: string }`. Mapping: a network failure before or during the stream is `unreachable`; an error message containing "file does not exist" or "not found" is `model-not-found`; one containing "no space", "not enough space" or "disk full" is `insufficient-disk-space`; anything else is `pull-failed` with the message as detail. The first mapping is grounded in the observed unknown-model message; the disk-space wording is not observed (it would need a full disk) and is treated as a best guess with the generic code as the safe fallback.
9. **Sequential pulls.** `pullMissingModels` checks the installed list, then pulls each missing model in order (embedding first, since a small model finishes quickly and confirms the path works), reporting the model in progress with each update, and stops at the first failure or cancellation.
10. **Readiness.** `checkSetup(client, requirements)` runs detection; on `unreachable` returns `get-ollama`, on `outdated` returns `update-ollama`, otherwise lists models (a failure here is `get-ollama`) and returns `pull-models` with the plan or `ready`. It caches nothing and has no side effects.
11. **Install guidance.** `installGuidance(platform)` returns `{ downloadUrl, steps }`, where `steps` is the ordered identifiers `download`, `install`, `start`, `recheck`. The `start` step exists because `unreachable` also means "installed but not running". Download addresses are the official `ollama.com/download/windows`, `/download/mac` and `/download/linux` pages, with `ollama.com/download` as the fallback (confirmed on the live download page). The caller supplies the platform; detecting it belongs to the UI change.
12. **Tests.** Unit tests use fake `fetch` functions that return `Response` objects with controllable bodies. A small local HTTP server (`node:http`) covers what fakes cannot: real chunked streaming with lines split across chunks, slow responses for the timeout, and aborting mid-stream. An opt-in test, enabled by an `OLLAMA_URL` environment variable, runs detection and readiness against the real Ollama and prints the results. A real pull runs only when `OLLAMA_PULL_MODEL` names a small model, and only with the user's approval of the model and size at that time.

## Risks / Trade-offs

- [CORS differs on other Ollama versions or a user-set `OLLAMA_ORIGINS`, and a browser cannot tell CORS from a dead server] → It surfaces as `unreachable`. Only 0.34.0 was checked. The Tauri HTTP plugin is the documented fallback; nothing else in the design changes.
- [`unreachable` merges not installed, not running, blocked, and wrong port] → The guidance data includes a `start` step and the UI wording can cover both cases. Distinguishing them would need an OS-level check, which is out of scope.
- [Ollama changes its pull stream] → Parse by shape (`error`, `total/completed`, `success`) and keep the last phase on unknown text.
- [Approximate sizes drift or are wrong for other models] → They are labeled approximate, unknown models show no size, and the total counts only known sizes.
- [A pull stalls without ending] → The caller can cancel and pull again, which resumes. No stall timer is added now.
- [The minimum version and download addresses come from Ollama's public release notes and download pages as of this change] → They are constants with their sources noted in code, so they are easy to revisit.
- [Real downloads are too big for automated tests] → Fake and local servers cover the logic; a small real pull is an opt-in manual check.

## Open Questions

- How the interface learns the platform (for the install guidance) is left to the UI change.
