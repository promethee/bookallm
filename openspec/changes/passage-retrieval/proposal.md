# Proposal

## Why

Ask mode answers a question from the book's own text, with a citation to the exact passage. Books are now indexed, but nothing can yet turn a question into the passages that answer it. The README also wants a plain "I can't find anything about that" when nothing in the book is relevant, and that needs a measured relevance cutoff, not a guess. This change adds retrieval as its own testable library, before the answer and the screen that depend on it.

## What Changes

- Add a retrieval step: embed the reader's question with the same model that built the index, compare it with every chunk vector of the active book by cosine similarity, and return the best passages ranked. Each passage carries its chunk text, its exact locator (chapter number and title, paragraph range, character range) and its score.
- Search only a book that is indexed for the configured model. Otherwise say so with a typed failure and send nothing.
- Give a verdict with every result: `relevant` when the best passage's score reaches a cutoff, `nothing-relevant` when it does not. The passages are still returned in both cases, and the verdict never claims the book lacks the answer.
- Choose the cutoff from real measurements: index the first 10 chapters of the real Pride and Prejudice with the real `bge-m3`, ask questions the text answers and questions it does not, and set the cutoff in the gap between their best scores. Record the data and its limits.
- Report typed failures (Ollama unreachable, model not found, unusable answer, index does not match, empty question, not indexed) and never throw for an expected outcome. Searching changes nothing that is stored.

### Non-goals

- The answer itself (an LLM answering from the passages with citations), the question box, the citation display and the conversation. Those are the Ask-mode change.
- Search restricted to one chapter (the README's "try chapter 7" recovery). It belongs with the conversation that asks for the location.
- Keyword or hybrid search, re-ranking, and keeping the vectors in memory between questions.
- Searching a book other than the active one, and Verify mode.

## Capabilities

### New Capabilities

- `passage-retrieval`: turns a question into ranked passages with exact locators and scores for an indexed book, gives a relevance verdict from a measured cutoff, and reports typed failures without changing any stored data.

### Modified Capabilities

None. Indexing already stores everything retrieval reads.

## Impact

- New code in `src/lib/retrieval/` (similarity, ranking, the retrieval function, the cutoff constant) and a manual real-Ollama test with a vector cache file. No screen, no new package, no storage change.
- Uses the existing embedding call, vector store and chunk locators.
- The real measurement needs about an hour of the reader's Ollama for about 150 chunks on the current machine.
