# Proposal

## Why

v1 (Ask mode) is done: passage retrieval, cited streamed generation, the conversation screen, and a first-run hardware warning all ship and work end to end. v1.1 (Verify mode) is the next planned mode per the README: instead of the reader asking questions, the app presents a claim about the book and the reader judges whether it is true, then sees the citation either way. This teaches the same source-checking habit from the other direction. This change builds the generation pipeline that produces those claims, as a library first - the same sequencing Ask mode used (`passage-retrieval`, then `answer-generation`, then `ask-mode-screen` built the UI on top of both).

## What Changes

- A new library picks a real chunk from the active, indexed book, has the configured chat model state one concrete, checkable claim from it and a version of that claim with exactly one attribute changed (cause, order of events, who did or said it, or where), and verifies with a second model call that the changed version actually contradicts the source before it is ever offered.
- The result names, session-side, whether the claim being offered is the true one or the changed one, and always carries the real citation (locator and passage text) to reveal afterward, matching Ask mode's own citation shape.
- If the model's changed version cannot be confirmed to contradict the source after a couple of tries, or a step fails outright (Ollama unreachable, chat model missing, chunk selection has nothing to draw from), the library returns a typed failure rather than presenting something unverified as false.
- No screen, no mode switcher, no session tally: those are `ask-mode-screen`'s sibling for Verify mode, a later change once this library exists and is checked against a real book and a real model, same as `answer-generation` preceded `ask-mode-screen`.

## Capabilities

### New Capabilities

- `claim-mutation`: selects a source chunk, generates a true claim and a deliberately-changed one, verifies the change actually contradicts the source, and returns one of the two (with which one, and the real citation, known to the caller) or a typed failure.

### Modified Capabilities

None. This reads the active book (already available via the existing `Book`/`Chunk` types from `epub-import`/`chapter-chunking`) and calls the configured chat model through the existing `OllamaClient`; it does not change how either already-shipped capability behaves.

## Impact

A new library module alongside `retrieval` and `answering`, with no UI, no i18n text, and no settings changes. Depends on the configured chat model (the same one `answer-generation` uses) and the active book's already-indexed chunks; does not depend on `passage-retrieval`, since picking a source chunk for a claim is a local selection over the book's own chunks, not a question-driven embedding search.
