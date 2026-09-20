# Proposal

## Why

Ask mode and Verify mode need a local language model and an embedding model, both served by Ollama. README onboarding puts this first: detect Ollama, walk a non-technical reader through installing it, then confirm and pull the default models (`llama3.1:8b`, `bge-m3`) without any silent multi-GB download. None of it exists yet. Checking this machine shows why partial states matter: Ollama is installed but not running, and only the embedding model is present, so a real first run is rarely "nothing" or "everything".

## What Changes

- Add a headless setup core that talks to Ollama over its local HTTP API: detect it, check its version, list installed models, and pull missing ones with progress.
- Report one overall readiness result with a single next step (get Ollama, update Ollama, pull models, or ready), which the later onboarding UI consumes.
- Show what a pull would download (model names and approximate sizes) before anything is downloaded; pulling only ever happens on an explicit request.
- Support cancelling a pull and pulling again later without losing partial progress.
- Provide install guidance as data (official download address per platform and ordered step identifiers), never as display text.
- Keep model names as inputs with the README defaults, so the user can swap models later.
- Out of scope: any screens or wording (that is the later `onboarding-ui` change), translations, saving settings, starting or installing Ollama on the user's behalf, the idle-unload timeout, and any Rust change.

## Capabilities

### New Capabilities

- `ollama-detection`: report whether Ollama is reachable and recent enough, without side effects, and supply install guidance data.
- `model-provisioning`: check which required models are installed, plan and perform explicit, cancellable pulls with progress, and report failures with typed codes.
- `setup-readiness`: combine detection and provisioning into one result naming the next setup step.

### Modified Capabilities

None. The existing specs cover EPUB ingestion and do not overlap.

## Impact

- New code under `src/lib/ollama/` with colocated Vitest tests. No new dependencies.
- No Rust or `tauri.conf.json` change: on the installed Ollama (0.34.0) a request from a Tauri webview origin is allowed by its CORS response, so the webview can use plain `fetch`.
- Later changes consume this API: `onboarding-ui` (the first-run screens and their wording), embeddings and retrieval (which reuse the client and model names), and settings (which persist the model names).
