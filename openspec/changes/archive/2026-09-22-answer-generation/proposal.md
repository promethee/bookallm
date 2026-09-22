# Proposal

## Why

Retrieval finds the passages that answer a question, but nothing yet turns them into an answer a reader can read. Ask mode needs a sincere, checkable answer: the model's own words, grounded in the retrieved passages, with every claim tied to an exact citation. This change adds that generation step as its own testable library, before the conversation and the screen that will use it.

## What Changes

- Add an answer step: given a question and the passages retrieval already ranked, ask the configured chat model (`llama3.1:8b` by default) to answer using only those passages, streaming the text as it is written.
- Number the retrieved passages in the prompt and have the model mark each claim with the number of the passage that supports it (`[1]`, `[2]`, …). As the stream is read, turn each marker into a citation carrying that passage's exact locator (chapter, paragraph range, character range). A citation number the model invents that was not offered is dropped, never guessed at.
- When retrieval's verdict is `nothing-relevant`, generate no answer: return the plain, fixed reply the README specifies ("I can't find anything about that: could you tell me where in the book that comes up?") without calling the chat model.
- Report typed failures (Ollama unreachable, chat model not found, the model's own error, aborted) and never throw for an expected outcome. Generating an answer changes nothing that is stored.
- Real-world check: ask the real chat model real questions about the real Pride and Prejudice passages retrieval already found, and read the answers and their citations by eye, since answer quality is a judgment call, not a deterministic test (see README "Testing scope").

### Non-goals

- Multi-turn conversation, history trimming, and the pinned "where does this come up" location hint. Those need a conversation to exist first.
- The chapter-restricted retry after a failed search, and the "hand over the raw chapter text" escalation. Both depend on that conversation.
- Any screen, the top bar, the mode tabs and the persistent mode disclosure.
- Verify mode. It reuses this pipeline but is a distinct generation flow (retrieve → mutate → verify), built after Ask mode as the README already scopes it.
- Judging answer quality automatically. Citation *shape* (resolves to a real passage, marks every claim) is unit-tested; whether an answer is actually good is a manual judgment, as the README's testing scope says for citation and answer quality.

## Capabilities

### New Capabilities

- `answer-generation`: turns a question and its retrieved passages into a streamed, cited answer from the configured chat model, or the plain "nothing found" reply when nothing is relevant, with typed failures and no stored data changed.

### Modified Capabilities

None. Retrieval already supplies everything this reads.

## Impact

- New code in `src/lib/answering/` (the chat call, the streaming citation parser, the function, defaults), reusing the existing NDJSON reader and the OllamaClient. No screen, no new package, no storage change.
- Uses Ollama's `POST /api/chat` with `stream: true`, already covered by the minimum supported Ollama version.
- The real-world check needs the reader's Ollama and a few minutes for the chat model to answer several questions (real chat models are much faster than the embedding calls measured in earlier changes, since they stream tokens rather than waiting for a whole batch).
