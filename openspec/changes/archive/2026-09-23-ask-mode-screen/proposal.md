# Proposal

## Why

Retrieval finds passages and answer-generation turns them into a cited, streamed answer, but a reader cannot ask anything yet: the landing screen only says Ask mode is "coming soon." This change gives the landing screen a question box and turns the retrieval and answer libraries into a working conversation the reader can actually use.

## What Changes

- The landing screen's "coming soon" placeholder becomes the Ask mode conversation whenever the active book is ready (indexed for the configured model): a question box, and each turn showing the question, the streamed answer, and its citations.
- A citation shows the exact passage it names (chapter, and the quoted text), not just a chapter number, matching the README's "quotable evidence" requirement.
- While an answer streams, the reader can stop it (an abort), and can otherwise not start a second question until the first finishes or is stopped.
- A `nothing-relevant` verdict shows the fixed "I can't find anything about that" reply like any other answer; no special screen state.
- Because the chat model can take several minutes to load cold (measured for real in `answer-generation`), the screen says so plainly while waiting for the first piece of text, the same way the indexing screen explains its own wait.
- Retrieval and generation failures (Ollama unreachable, a model not found, an unusable answer) show a plain message with a retry for that turn; earlier turns in the conversation are kept.
- The conversation is per session, not saved: it starts empty each time the app opens, and starts over if the active book changes.
- Real-world check: ask the real chat model real questions through the real screen, against the real Pride and Prejudice, using the reader's Ollama.

### Non-goals

- Saving the conversation across restarts. Left for a later change if wanted.
- The chapter-restricted retry and raw-text handoff after a failed search (the README's recovery/escalation flow). A separate change, once this one is proven.
- Verify mode, the book-switcher dropdown, the mode tabs and the command palette. All v2 or depend on features that do not exist yet (multiple books, a second mode).
- History trimming for long sessions. Nothing here yet makes a session long enough to need it.

## Capabilities

### New Capabilities

- `ask-conversation`: turns the landing screen, once the active book is ready, into a working Ask mode conversation: asking a question, showing the streamed answer with citations to the exact passage, stopping an answer, a plain wait state for a slow first answer, typed failures with retry, and a conversation that resets with the session or the active book.

### Modified Capabilities

- `first-run-flow`: the landing screen's requirement changes from "Ask mode itself is not part of this screen" to describing the conversation it now shows.

## Impact

- New code in `src/components/` (an `AskConversation.svelte` shown from `LandingScreen.svelte`) and `src/lib/onboarding/` (conversation state added to the existing controller, since there is exactly one active book and one conversation per session, the same place model download and indexing state already live).
- Uses the existing `retrievePassages` and `generateAnswer` libraries and the configured chat and embedding models; no new Ollama endpoints.
- No storage or schema change: the conversation lives only in memory.
