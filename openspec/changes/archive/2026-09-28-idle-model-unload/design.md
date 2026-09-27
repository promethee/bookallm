# Design

## Context

- Ollama's `/api/chat` and `/api/embed` accept `keep_alive`: a duration string such as `"10m"`, a number of seconds, `0` to unload right after, or a negative number to keep the model loaded indefinitely. Without it, Ollama uses its own default (5 minutes unless the server's `OLLAMA_KEEP_ALIVE` says otherwise). Each request resets the model's expiry.
- Every chat request in the app goes through `streamChat` (`src/lib/answering/chat.ts`), including Verify's claim prompts (`src/lib/mutation/chat.ts` drains it). Every embedding request goes through `embedTexts` (`src/lib/indexing/embed.ts`): indexing, retrieval and the hardware check.
- Both receive an `OllamaClient` (`src/lib/ollama/client.ts`), which the controller creates through `services.createClient(baseUrl)` for each piece of work, with the saved address.
- Settings are parsed field by field in `parseSettings`, which drops anything invalid so the default applies.
- There is no settings screen after setup; the landing screen shows the book card, "Import a book" and the mode tabs.

## Goals / Non-Goals

**Goals:**

- One place decides the keep-alive for all requests, so a new kind of request cannot forget it.

**Non-Goals:**

- Unloading on app close or on setting change (see proposal).

## Decisions

### 1. The client carries the keep-alive; `streamChat` and `embedTexts` send it

`OllamaClientOptions` and `OllamaClient` gain `keepAlive?: string | number`. `streamChat` and `embedTexts` add `keep_alive: client.keepAlive` to their request body when it is defined, and omit the field otherwise, so a client created without it (tests, the manual real-world tests) behaves exactly as today.

`Services.createClient(baseUrl)` becomes `createClient(baseUrl, keepAlive?)`, and the controller always passes `keepAliveFor(this.settings.idleUnload)`. Because the controller creates a client for each piece of work, a changed setting applies from the next request without any extra wiring.

Alternative: a `keepAlive` parameter on `streamChat` and `embedTexts` themselves. Rejected: every caller (answering, mutation's extraction, mutation and verification steps, indexing, retrieval, the hardware check) would have to remember it; the client is already the thing they all share.

### 2. The setting and its mapping

`Settings.idleUnload?: 5 | 10 | 30 | 'never'`, absent meaning the default. `IDLE_UNLOAD_DEFAULT = 10` and `IDLE_UNLOAD_CHOICES = [5, 10, 30, 'never']` live in `src/lib/ollama/defaults.ts` beside the other Ollama defaults. `keepAliveFor(choice)` maps minutes to `"<n>m"` and `'never'` to `-1`. `parseSettings` keeps the field only when it is one of the choices.

### 3. The control

`IdleUnload.svelte`: a label "Free memory after" and a native `<select>` with "5 minutes", "10 minutes", "30 minutes", "Never", under the "Import a book" button on the landing screen. Changing it calls `controller.setIdleUnload(choice)`, which saves the setting. A native select gives keyboard operation and a visible label without custom code. A one-line hint under it says what it means ("After this long without a question or claim, Ollama frees the memory. The next answer then takes longer.").

### 4. No request on change

Changing the setting only affects later requests. Re-applying it at once would need a request that loads the model (Ollama has no "set expiry" call), which would load it if it was already unloaded, the opposite of the point.

## Risks / Trade-offs

- [The first answer after an unload is slow again: tens of seconds on the GPU machine, minutes on CPU] → Accepted by the README; the existing "getting ready" note covers the wait.
- [The server's `OLLAMA_KEEP_ALIVE` is overridden by the app's value] → Intended: the reader's choice in the app wins; "Never" covers readers who want models kept.
- [Other apps using the same Ollama model reset its expiry with their own values] → Out of the app's control; Ollama applies the latest request's value.

## Real-world check (2026-09-28)

In the real app (`pnpm dev` in a browser) against the local Ollama on the GPU machine (RTX 3060, `llama3.1:8b`, `bge-m3`), with *Candide* imported and indexed. `expires_at` read from `/api/ps` right after each step:

| Setting | Step | `bge-m3` expires in | `llama3.1:8b` expires in |
| --- | --- | --- | --- |
| Default (10 min) | Indexing just finished | 9.7 min | (not loaded) |
| 5 min | A question answered | 4.4 min | 4.9 min |
| Never | A question answered | year 2319 | year 2319 |

- Each value matches the setting, less the time since that model's last request. Ollama represents "never" as a far-future date.
- Changing the setting sent no request; the new value took effect on the next question, as specified.
- Afterwards the setting was put back to 10 minutes and both models were unloaded (`keep_alive: 0`), so the check left nothing held in GPU memory.

## Migration Plan

One optional setting is added; existing saved settings without it get the default. Rollback: revert; the extra field is ignored by the old `parseSettings`.
