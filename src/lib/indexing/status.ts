import type { Book, Chunk } from '../ingest/types';
import { normalizeModelName } from '../ollama';
import type { VectorStore } from './types';

/** Where a book stands for one embedding model, worked out from what is really saved. */
export interface IndexStatus {
  /**
   * `complete`: every chapter that has chunks has its vectors. `partial`: some do.
   * `none`: none do (a book without chunks is `complete`).
   */
  state: 'complete' | 'partial' | 'none';
  /** Chapters that have chunks, so need vectors. */
  chapterTotal: number;
  /** Of those, the chapters already saved for this model. */
  chapterDone: number;
  /**
   * Vectors made by a different model exist and this model has not finished, so indexing
   * is a rebuild, not a first index.
   */
  rebuild: boolean;
}

/** The chunks of a book by chapter number, in chapter order. Chapters without chunks are absent. */
export function chunksByChapter(
  chunks: readonly Chunk[],
): Map<number, Chunk[]> {
  const byChapter = new Map<number, Chunk[]>();
  for (const chunk of chunks) {
    const list = byChapter.get(chunk.locator.chapterNumber);
    if (list) list.push(chunk);
    else byChapter.set(chunk.locator.chapterNumber, [chunk]);
  }
  return new Map([...byChapter].sort(([a], [b]) => a - b));
}

/**
 * Whether a book is indexed for a model. Nothing is stored about this: it is computed by
 * comparing the chapters that need vectors with the chapters that have them, so it can
 * never disagree with the vectors themselves. Model names are compared normalised, so
 * `bge-m3` and `bge-m3:latest` are the same model.
 */
export async function indexStatus(
  book: Pick<Book, 'hash' | 'chunks'>,
  model: string,
  store: VectorStore,
): Promise<IndexStatus> {
  const wanted = normalizeModelName(model);
  const needed = new Set(chunksByChapter(book.chunks).keys());
  const saved = await store.savedChapters(book.hash, wanted);
  const chapterDone = saved.filter(({ chapter }) => needed.has(chapter)).length;
  const chapterTotal = needed.size;

  const state =
    chapterDone === chapterTotal
      ? 'complete'
      : chapterDone === 0
        ? 'none'
        : 'partial';
  const others = (await store.modelsWithVectors(book.hash)).some(
    (name) => normalizeModelName(name) !== wanted,
  );
  return {
    state,
    chapterTotal,
    chapterDone,
    rebuild: state !== 'complete' && others,
  };
}
