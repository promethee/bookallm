# Design

## Context

Books are indexed chapter by chapter: for each chapter with chunks, the vector store holds one record with the chunk ids and one `Float32Array` of vectors (chunk count times dimension) under the normalised embedding model name. `indexStatus` says from those records whether a book is indexed for a model. `embedTexts` embeds texts through Ollama and returns typed results, and the simulated Ollama gives deterministic word-based fake embeddings. Each chunk has a locator (chapter number and title, paragraph range, character range), and chunk text equals the chapter text at that range. Real measurements on the reader's machine: a chunk takes 20 to 30 seconds to embed on a busy laptop CPU, `bge-m3` vectors are 1,024 numbers, and the first request also loads the model (about 16 seconds). See proposal.md for scope.

## Goals / Non-Goals

**Goals:**

- One pure, testable retrieval function whose result carries everything a later answer needs to cite: text, exact locator and score.
- A relevance cutoff chosen from real measurements, with the data and its limits recorded.
- No hidden state: a search reads and returns, and calling it twice gives the same result.

**Non-Goals:**

- Answer generation, screens, chapter-restricted search, hybrid or keyword search, re-ranking, and a vector cache. Loading the vectors for each question is cheap at this size (about 3 MB for a novel) and a cache is easy to add behind the same function later.

## Decisions

1. **New module `src/lib/retrieval/`, no UI code.** `similarity.ts` (cosine and top-k), `retrieve.ts` (the function), `defaults.ts` (number of passages, question length limit, the cutoff and where it came from), `types.ts`. Same shape as `indexing`.

2. **The function.** `retrievePassages({ book, question, model, client, store, limit?, signal? })` returns `{ status: 'ok', verdict, passages }`, `{ status: 'aborted' }` or `{ status: 'failed', error }`. Steps: clean the question (collapse whitespace, trim, cut at the limit, refuse an empty one); check `indexStatus` is `complete` for the model, or fail as `not-indexed`; embed the question with the model as configured; read every saved chapter's vectors for the normalised model; score each chunk by cosine similarity; sort by score descending with ties by chunk order; take the top `limit` (default 5); attach each chunk's text and locator from the book; give the verdict from the best score.

3. **Cosine similarity, computed here.** The stored vectors are used as saved (bge-m3 vectors are close to unit length but the code does not rely on that): the score is the dot product divided by the two lengths, with a zero-length vector scoring 0. A plain loop over about 700 vectors of 1,024 numbers is instant; there is no index structure. _Alternative: dot product only, rejected: it silently depends on the model normalising its output._

4. **Typed failures reuse the indexing ones.** `unreachable`, `model-not-found` and `embed-failed` come straight from `embedTexts`. New codes: `not-indexed`, `empty-question`, `index-mismatch` (question vector length differs from the stored dimension, for example after a model swap that kept the same name). An unexpected store error becomes `embed-failed` with its message, as in the indexer.

5. **The verdict.** `relevant` when the best score is at or above `RELEVANCE_CUTOFF`, else `nothing-relevant`. The passages are returned either way, so the caller can still show them or use them for the README's "point me to where it comes up" flow. The verdict is deliberately about the best passage only: a good answer needs one good passage. The wording shown to the reader ("I can't find anything about that", never "this isn't in the book") belongs to the Ask-mode change.

6. **Choosing the cutoff from data.** A manual, environment-guarded test indexes the first chapters of the real Pride and Prejudice with the real `bge-m3`, caches the vectors in a file (an index that stops can resume, and tuning costs no more embedding), and prints for each question the best scores and passages. Questions come in three groups: answered by the indexed chapters (with the chapter that should come back), unrelated to the book, and about the book's subject but not in the indexed part. The cutoff goes in the gap between the lowest answered best score and the highest unrelated best score, and the third group shows how fuzzy that gap is. The values, the gap and the limits (one book, part of it, one language, one model) go into this design. The measurement is recorded below and the constant now holds the measured value.

7. **Tests and fakes.** The simulated Ollama can be given fixed vectors for chosen texts, so unit tests control every score: ranking order, ties, the default and small limits, exact-text questions ranking first, the verdict on either side of the cutoff, index mismatch, the typed failures, an aborted request, and nothing being written to the store. The retrieval function itself needs no Ollama and no browser.

## Risks / Trade-offs

- [The cutoff is tuned on part of one English novel and one model] → It is a named constant, the test prints the scores for a person to judge, the limits are written down, and a different model or language means measuring again.
- [Embedding the question takes seconds on a slow machine, more when the model has to load] → Nothing here changes that; the Ask-mode change shows a wait state, and the timeout already scales with the number of texts.
- [Cosine similarity over all chunks is linear in the book's length] → About 700 chunks is instant. A much larger book would need a smarter index, which the function's shape allows.
- [A book indexed with a model that is later swapped without a rebuild would be searched with the wrong vectors] → A search requires a complete index for the configured model, and a vector length mismatch is a typed failure.
- [The verdict from the best score alone can call a vague but on-topic question relevant] → Accepted for now; the third question group in the real measurement shows how often it happens.

## Migration Plan

None. No stored data or storage format changes.

## Real-world measurement (the user's Ollama 0.34.0, real `bge-m3`, real Pride and Prejudice)

**Setup.** Chapters I to XIII of the real EPUB (table-of-contents entries 3 to 15, the front matter left out): 100 chunks, embedded in about 20 minutes (about 14 seconds a chunk after the CPU hogs on the machine were ended). Scores are the best cosine similarity per question, from `real-retrieval.manual.test.ts`, which keeps the vectors in a cache file so it can be rerun without embedding the book again.

**Answered by the indexed chapters (10 questions), best score:** 0.5323 who has taken Netherfield Park; 0.6003 why Darcy refused to dance; 0.6679 what Darcy says about Elizabeth at the ball; 0.5953 where Bingley's fortune came from; 0.5470 who Sir William Lucas is; 0.6355 why Jane goes on horseback in the rain; 0.5247 Mr. Bennet's estate and heir; 0.5755 Charlotte Lucas on showing affection; 0.6202 how the Bingley sisters treat Elizabeth; 0.5919 what Mr. Collins writes. Range 0.5247 to 0.6679. The expected chapter was among the top 3 passages for 9 of 10; the miss was Darcy's remark about Elizabeth (the top 3 came from chapters VI and IX, not chapter III).

**Unrelated (6 questions), best score:** photosynthesis 0.3604; capital of Japan 0.3450; installing a Python package 0.3287; boiling point of water 0.3482; the 2018 football world cup 0.3806; a chocolate cake recipe 0.3869. Range 0.3287 to 0.3869.

**About the book but not in the indexed part (4 questions), best score:** Pemberley 0.5884; who Lydia runs away with 0.4676; Elizabeth's answer to Darcy's first proposal 0.6716; Lady Catherine de Bourgh in her garden 0.5058. Range 0.4676 to 0.6716.

**Result.** The gap between the lowest answered (0.5247) and the highest unrelated (0.3869) is 0.1378, with its midpoint at 0.4558. The cutoff is set to 0.46: 0.0653 above the highest unrelated question and 0.0647 below the lowest answered one.

**Limits, stated plainly.**

- One English novel, 100 chunks of it, one model, 20 hand-written questions. A different book, language or model means measuring again.
- The verdict separates "about something else" from "about this book". It does not separate "about this book but not answered here": three of the four such questions scored as high as answered ones, because they share the book's names and vocabulary (Darcy, Elizabeth, Pemberley). Only the answer step, reading the passages, can judge that, and the Ask-mode change must not treat `relevant` as "the answer is here".
- The best passage was in the top 3 for 9 of 10 answered questions; the number of passages (5) was not tuned separately and only the top 3 were printed.
- Ranking quality is the model's: the missed question shows a real weakness of embeddings for a remark like "she is tolerable", which is why every passage carries its exact locator for the reader to check.

