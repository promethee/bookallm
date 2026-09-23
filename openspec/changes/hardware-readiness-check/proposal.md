# Proposal

## Why

Real measurement (this session's own real-world checks on `ask-mode-screen`, backed by a zero-config benchmark run on a second machine) found that whether Ollama can offload the chat model to a GPU is the dominant factor in answer speed: 15.6 seconds cold and under a second warm with full GPU offload, versus 250-800+ seconds or outright failure with none. A reader on a non-accelerated machine currently discovers this only after choosing a language, getting Ollama running, downloading both required models (multiple GB), and importing a book — a lot of invested time before the first real disappointment. They should know this upfront, while still being free to continue if they choose to.

## What Changes

- After the required models are installed (confirmed by `setup-readiness`/`model-provisioning`, whether they were already present or just downloaded) but before the reader can import a book, make one small, deliberate request to the required embedding model (not the large chat model, and not a new download: the embedding model must already be installed by this point) and read Ollama's own reported memory usage for it. Real measurement: this request took 1.5-16.7 seconds cold in this session's own checks — seconds, not the minutes a full chat request without GPU offload can take.
- If that model's reported usage shows no GPU offload, show a plain-language warning screen: this machine doesn't appear to accelerate local AI, answers will likely take several minutes each rather than seconds, with a "Continue anyway" action.
- The warning is shown once per install. Once acknowledged, it SHALL NOT reappear on later launches, even though the underlying fact is unchanged (same remembered-choice pattern the app already uses for confirmed model names).
- If GPU offload is detected, or the check itself cannot get a clear answer (Ollama becomes unreachable, the request fails), the app proceeds straight through as it does today — this check never blocks or fails a launch, and never replaces the existing Ollama/model detection screens earlier in the sequence.
- **Not** a hard block: the reader can always continue past the warning. This is a portfolio project meant to be explored, not gatekept, so the goal is informed consent, not a "your machine isn't good enough" wall.

## Capabilities

### New Capabilities

- `hardware-readiness`: performs the one check (a real request already needed for provisioning, reading whether Ollama reports GPU-accelerated memory use for it), decides accelerated vs not, and defines the warning screen's content, override action, and once-per-install persistence.

### Modified Capabilities

- `first-run-flow`: the "next screen comes from the real state" requirement's screen-sequencing priority gains one more step — the hardware warning, checked once models are ready and not yet acknowledged, before the book import screen.

## Impact

Onboarding flow gains one more possible screen, shown at most once per install, and one small extra request (seconds, not minutes) the first time it runs. No changes to Ask mode, retrieval, generation, or any already-shipped answering behavior. `model-provisioning` and `ollama-onboarding` are unaffected (they only ever call `/api/tags`, which does not load a model); `setup-readiness`'s own decision logic is unaffected, though `first-run-flow` inserts this check's result into its screen-sequencing priority.
