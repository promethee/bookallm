import type { OllamaClient } from '../ollama';
import { normalizeModelName } from '../ollama';
import type { Book, Chunk } from '../ingest/types';
import { StorageFullError } from '../storage/errors';
import { EMBED_BATCH_SIZE, embedTexts } from './embed';
import { chunksByChapter } from './status';
import type { IndexError, IndexProgress, VectorStore } from './types';

export interface IndexBookOptions {
  book: Pick<Book, 'hash' | 'chunks'>;
  /** The embedding model as configured. It is saved under its normalised name. */
  model: string;
  client: OllamaClient;
  store: VectorStore;
  /** Aborting this stops indexing; chapters already saved stay saved. */
  signal?: AbortSignal;
  /** Called as work is done. Errors thrown by it are ignored. */
  onProgress?: (progress: IndexProgress) => void;
  /** Texts per request; tests use a small one. */
  batchSize?: number;
}

export type IndexResult =
  | { status: 'complete' }
  | { status: 'aborted' }
  | { status: 'failed'; error: IndexError };

const failed = (error: IndexError): IndexResult => ({
  status: 'failed',
  error,
});

/** Turns whatever a store threw into a typed failure. */
function storeFailure(error: unknown): IndexResult {
  if (error instanceof StorageFullError)
    return failed({ code: 'storage-full' });
  return failed({
    code: 'embed-failed',
    detail: error instanceof Error ? error.message : String(error),
  });
}

/** Flattens vectors chunk after chunk, the layout `ChapterVectors` stores. */
function flatten(
  vectors: readonly number[][],
  dimension: number,
): Float32Array {
  const flat = new Float32Array(vectors.length * dimension);
  for (const [position, vector] of vectors.entries())
    flat.set(vector, position * dimension);
  return flat;
}

/**
 * Embeds every chunk of a book and saves the vectors one chapter at a time, and never
 * throws for an expected outcome.
 *
 * - Chapters already saved for the model are skipped, so an interrupted index resumes
 *   where it stopped and a finished one sends nothing.
 * - A chapter is saved only when all of its chunks have vectors, so there is never half
 *   a chapter. Failures and aborts keep every chapter saved before them.
 * - If new vectors are longer or shorter than the ones already saved for this model
 *   name, the model behind the name has changed: the saved vectors are discarded and the
 *   index starts again.
 * - Vectors of other models are deleted only once this model's index is complete, so an
 *   interrupted rebuild keeps the old index.
 */
export async function indexBook(
  options: IndexBookOptions,
): Promise<IndexResult> {
  return run(options, true);
}

async function run(
  options: IndexBookOptions,
  mayRestart: boolean,
): Promise<IndexResult> {
  const { book, client, store, signal, onProgress } = options;
  const requestModel = options.model.trim();
  const model = normalizeModelName(options.model);
  const batchSize = options.batchSize ?? EMBED_BATCH_SIZE;

  const chapters = chunksByChapter(book.chunks);
  const chunksTotal = book.chunks.length;

  let chapterDone: number;
  let chunksDone: number;
  let expectedDimension: number | undefined;
  let savedDimension: number | undefined;
  let todo: [number, Chunk[]][];
  try {
    const saved = (await store.savedChapters(book.hash, model)).filter(
      ({ chapter }) => chapters.has(chapter),
    );
    const savedNumbers = new Set(saved.map(({ chapter }) => chapter));
    todo = [...chapters].filter(([number]) => !savedNumbers.has(number));
    chapterDone = saved.length;
    chunksDone = saved.reduce(
      (sum, { chapter }) => sum + chapters.get(chapter)!.length,
      0,
    );
    savedDimension = saved[0]?.dimension;
    expectedDimension = savedDimension;
  } catch (error) {
    return storeFailure(error);
  }

  const report = (extra = 0): void => {
    try {
      onProgress?.({
        chapterPosition: Math.min(chapterDone + 1, chapters.size),
        chapterTotal: chapters.size,
        chunksDone: chunksDone + extra,
        chunksTotal,
      });
    } catch {
      // A faulty progress listener must not break indexing.
    }
  };
  report();

  for (const [number, chunks] of todo) {
    const vectors: number[][] = [];
    for (let start = 0; start < chunks.length; start += batchSize) {
      if (signal?.aborted) return { status: 'aborted' };
      const batch = chunks.slice(start, start + batchSize);
      const result = await embedTexts(
        client,
        requestModel,
        batch.map((chunk) => chunk.text),
        { signal },
      );
      if (result.status === 'aborted') return result;
      if (result.status === 'failed') return failed(result.error);

      const dimension = result.vectors[0].length;
      expectedDimension ??= dimension;
      if (dimension !== expectedDimension) {
        // Only vectors saved by an earlier run can be stale; a mix inside one run is an error.
        if (savedDimension !== undefined && mayRestart) {
          try {
            await store.discard(book.hash, model);
          } catch (error) {
            return storeFailure(error);
          }
          return run(options, false);
        }
        return failed({
          code: 'embed-failed',
          detail: 'The vectors do not all have the same length',
        });
      }
      vectors.push(...result.vectors);
      report(vectors.length);
    }

    try {
      await store.saveChapter({
        hash: book.hash,
        model,
        chapter: number,
        dimension: expectedDimension!,
        chunkIds: chunks.map((chunk) => chunk.id),
        vectors: flatten(vectors, expectedDimension!),
      });
    } catch (error) {
      return storeFailure(error);
    }
    chapterDone += 1;
    chunksDone += chunks.length;
    report();
  }

  try {
    await store.discardOtherModels(book.hash, model);
  } catch {
    // The index is complete. Leftovers of an old model only cost space and are retried
    // the next time this book is indexed.
  }
  return { status: 'complete' };
}
