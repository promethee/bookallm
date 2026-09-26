import { chunksByChapter, embedTexts, indexStatus } from '../indexing';
import type { VectorStore } from '../indexing';
import type { Book } from '../ingest/types';
import { normalizeModelName, type OllamaClient } from '../ollama';
import {
  DEFAULT_PASSAGE_COUNT,
  MAX_QUESTION_LENGTH,
  RELEVANCE_CUTOFF,
} from './defaults';
import { cosineSimilarity, rankScores } from './similarity';
import type {
  Passage,
  RetrievalError,
  RetrievalResult,
  Verdict,
} from './types';

export interface RetrieveOptions {
  book: Pick<Book, 'hash' | 'chunks'>;
  question: string;
  /** The embedding model as configured: the one the book's index was built with. */
  model: string;
  client: OllamaClient;
  store: VectorStore;
  /** How many passages to return. Defaults to `DEFAULT_PASSAGE_COUNT`. */
  limit?: number;
  /** Replaces `RELEVANCE_CUTOFF`; the real-book measurement uses it to try values. */
  cutoff?: number;
  /**
   * Restricts the search to the chapter at this 1-based table-of-contents position: only
   * its chunks are ranked and only its vectors are read. The verdict is computed as usual.
   */
  chapterNumber?: number;
  /** Aborting this stops the search while it waits for Ollama. */
  signal?: AbortSignal;
}

const failed = (error: RetrievalError): RetrievalResult => ({
  status: 'failed',
  error,
});

/**
 * The question as it is embedded: runs of whitespace become one space, the ends are
 * trimmed, and anything beyond `MAX_QUESTION_LENGTH` characters is cut (without splitting
 * a character that takes two code units).
 */
export function cleanQuestion(question: string): string {
  const collapsed = question.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_QUESTION_LENGTH) return collapsed;
  let cut = collapsed.slice(0, MAX_QUESTION_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trim();
}

/**
 * Finds the passages of an indexed book that best match a question, and never throws for
 * an expected outcome.
 *
 * - The book must be completely indexed for the configured model; a search never uses
 *   part of an index, and nothing is sent to Ollama for a book that is not indexed.
 * - The question is embedded with that same model and goes only to the configured
 *   Ollama address.
 * - Every chunk is scored by cosine similarity and the best `limit` come back, best
 *   first, each with its text, exact locator and score. Equal scores keep the order of
 *   the book, so the same question always gives the same answer.
 * - The verdict compares the best score with the relevance cutoff. The passages are
 *   returned whatever the verdict, and it never claims the book has no answer.
 * - With `chapterNumber`, only that chapter is searched; a chapter without text finds
 *   nothing and sends nothing to Ollama.
 * - Nothing is written: the store is only read.
 */
export async function retrievePassages(
  options: RetrieveOptions,
): Promise<RetrievalResult> {
  const { book, client, store, signal, chapterNumber } = options;
  const limit = options.limit ?? DEFAULT_PASSAGE_COUNT;
  const cutoff = options.cutoff ?? RELEVANCE_CUTOFF;
  const model = normalizeModelName(options.model);

  const question = cleanQuestion(options.question);
  if (question === '') return failed({ code: 'empty-question' });

  const candidates =
    chapterNumber === undefined
      ? book.chunks
      : book.chunks.filter(
          (chunk) => chunk.locator.chapterNumber === chapterNumber,
        );

  try {
    const status = await indexStatus(book, options.model, store);
    if (status.state !== 'complete') return failed({ code: 'not-indexed' });
    // A book (or chapter) without text has nothing to find: no reason to bother Ollama.
    if (candidates.length === 0)
      return { status: 'ok', verdict: 'nothing-relevant', passages: [] };
  } catch (error) {
    return failed({
      code: 'embed-failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const embedded = await embedTexts(client, options.model.trim(), [question], {
    signal,
  });
  if (embedded.status === 'aborted') return embedded;
  if (embedded.status === 'failed') {
    const { code, detail } = embedded.error;
    return failed({
      code:
        code === 'unreachable' || code === 'model-not-found'
          ? code
          : 'embed-failed',
      detail,
    });
  }
  const query = embedded.vectors[0];

  // Every chunk's saved vector, found by the chunk's id.
  const vectors = new Map<string, Float32Array>();
  try {
    for (const chapter of chunksByChapter(candidates).keys()) {
      if (signal?.aborted) return { status: 'aborted' };
      const record = await store.loadChapter(book.hash, model, chapter);
      if (!record) return failed({ code: 'not-indexed' });
      if (record.dimension !== query.length)
        return failed({
          code: 'index-mismatch',
          detail: `The question has ${query.length} numbers but the index has ${record.dimension}`,
        });
      record.chunkIds.forEach((id, position) =>
        vectors.set(
          id,
          record.vectors.subarray(
            position * record.dimension,
            (position + 1) * record.dimension,
          ),
        ),
      );
    }
  } catch (error) {
    return failed({
      code: 'embed-failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const scores: number[] = [];
  for (const chunk of candidates) {
    const vector = vectors.get(chunk.id);
    if (!vector) return failed({ code: 'not-indexed' });
    scores.push(cosineSimilarity(query, vector));
  }

  const passages: Passage[] = rankScores(scores, limit).map(
    ({ index, score }) => {
      const chunk = candidates[index];
      return {
        chunkId: chunk.id,
        text: chunk.text,
        locator: { ...chunk.locator },
        score,
      };
    },
  );
  const verdict: Verdict =
    passages.length > 0 && passages[0].score >= cutoff
      ? 'relevant'
      : 'nothing-relevant';
  return { status: 'ok', verdict, passages };
}
