/**
 * Stable, machine-readable failure codes for indexing. The core carries no display text:
 * the interface maps a code to a message in the reader's language.
 */
export type IndexErrorCode =
  'unreachable' | 'model-not-found' | 'storage-full' | 'embed-failed';

export interface IndexError {
  code: IndexErrorCode;
  /** Ollama's own message, or what went wrong, kept for diagnostics. */
  detail?: string;
}

/**
 * The vectors of one chapter of one book from one model, saved together or not at all.
 * Vectors are stored chunk after chunk in one array, so the vector of `chunkIds[i]` is
 * `vectors.subarray(i * dimension, (i + 1) * dimension)`.
 */
export interface ChapterVectors {
  /** The book's hash. */
  hash: string;
  /** The model's normalised name (see `normalizeModelName`). */
  model: string;
  /** 1-based chapter number, as in a chunk's locator. */
  chapter: number;
  /** How many numbers each vector has. */
  dimension: number;
  /** Ids of the chapter's chunks, in order. */
  chunkIds: string[];
  /** `chunkIds.length * dimension` numbers. */
  vectors: Float32Array;
}

/** What is known about a saved chapter without loading its vectors. */
export interface SavedChapter {
  chapter: number;
  dimension: number;
}

/**
 * Where vectors are kept. Async so a file- or SQLite-backed store can replace the
 * in-memory and IndexedDB ones. Implementations must satisfy the shared contract tests.
 * Model names are always the normalised names.
 */
export interface VectorStore {
  /** The chapters saved for this book and model, in chapter order. */
  savedChapters(hash: string, model: string): Promise<SavedChapter[]>;
  loadChapter(
    hash: string,
    model: string,
    chapter: number,
  ): Promise<ChapterVectors | undefined>;
  /**
   * Saves one chapter's vectors in one all-or-nothing step, replacing any earlier record
   * for the same chapter. Rejects with `StorageFullError` when there is no room, leaving
   * nothing of the chapter behind.
   */
  saveChapter(record: ChapterVectors): Promise<void>;
  /** Removes every chapter saved for this book and model. */
  discard(hash: string, model: string): Promise<void>;
  /** Removes every chapter of this book saved by any model except `keepModel`. */
  discardOtherModels(hash: string, keepModel: string): Promise<void>;
  /** The models that have at least one saved chapter for this book. */
  modelsWithVectors(hash: string): Promise<string[]>;
}

/** How far indexing has got. Every number counts only work that has really happened. */
export interface IndexProgress {
  /** 1-based position of the chapter being indexed among chapters that have chunks. */
  chapterPosition: number;
  /** How many chapters have chunks and so need vectors, including saved ones. */
  chapterTotal: number;
  /** Chunks that have a vector, including those of saved chapters. */
  chunksDone: number;
  /** All the chunks that need a vector. */
  chunksTotal: number;
}

export type EmbedResult =
  /** One vector per text sent, in order, all non-empty, finite and the same length. */
  | { status: 'ok'; vectors: number[][] }
  /** The caller aborted; nothing else is known. */
  | { status: 'aborted' }
  | { status: 'failed'; error: IndexError };
