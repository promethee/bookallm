# Proposal

## Why

The chat model takes about 5.5 GB of GPU memory and the embedding model about 1.2 GB, and BookaLLM never says how long Ollama should keep them loaded, so they stay for Ollama's own default and the reader has no say. The README makes this a v1 behaviour: "the Ollama model unloads after a configurable idle timeout (sensible default, e.g. 10 min) to avoid holding VRAM/RAM indefinitely", accepting that the first message after an unload takes longer.

## What Changes

- Every request that makes Ollama load a model (chat answers, Verify claim prompts, embeddings for indexing, search and the hardware check) tells Ollama how long to keep that model after it, through Ollama's `keep_alive` field.
- A saved setting chooses that time: 5, 10 or 30 minutes, or never unload. The default is 10 minutes.
- A small "Free memory after" control on the main screen, under the book card, changes it. The choice applies from the next request.
- English and French, keyboard-operable.
- Real-world check against the local Ollama: `/api/ps` shows the loaded models expiring after the chosen time.

### Non-goals

- The system tray (staying resident, reopening from the tray). Tauri work, its own change.
- A general settings screen. The Ollama address and model names stay where they are (setup screens).
- Unloading at once when the setting changes, or when the app closes. Ollama unloads on its own schedule; the new time applies from the next request.
- Any timeout other than the four offered choices.

## Capabilities

### New Capabilities

- `idle-unload`: how long Ollama keeps the app's models loaded after their last use: the setting, its default and choices, the control, and that every model-loading request carries it.

### Modified Capabilities

(none: `local-persistence` already requires settings to survive a restart and unreadable settings to fall back to defaults; the new setting follows those rules.)

## Impact

- `src/lib/storage/settings.ts`: the new setting, its default and its validation in `parseSettings`.
- `src/lib/ollama/client.ts`: the client carries an optional keep-alive; `src/lib/answering/chat.ts` and `src/lib/indexing/embed.ts` send it as `keep_alive`.
- `src/lib/onboarding/services.ts` and `controller.svelte.ts`: clients are created with the saved keep-alive; a `setIdleUnload` action.
- A small component under the book card, and messages in `src/lib/i18n/messages.ts`.
- No new dependency, no storage schema change beyond one optional setting.
