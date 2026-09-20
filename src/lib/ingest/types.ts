/**
 * Shared types for EPUB ingestion.
 *
 * Every character offset in this module (chunk locators, chapter text ranges) is a
 * UTF-16 code-unit index, i.e. a plain JavaScript string index. Later stages
 * (embeddings, citations, UI highlighting) must use the same convention.
 */

/** DRM scheme named in a `drm-locked` error. */
export type DrmScheme = 'adobe' | 'apple' | 'readium' | 'unknown';

/**
 * Stable, machine-readable failure codes. The core carries no display text: the
 * interface maps a code to a message in the user's language.
 */
export type IngestErrorCode =
  'not-an-epub' | 'malformed-epub' | 'no-text-content' | 'drm-locked';

export interface IngestError {
  code: IngestErrorCode;
  /** Only set when `code` is `drm-locked`. */
  scheme?: DrmScheme;
}

/** Where a chunk sits in its book, precise enough to cite. */
export interface ChunkLocator {
  /** 1-based position of the chapter in the book's table of contents. */
  chapterNumber: number;
  chapterTitle: string;
  /** Inclusive range of paragraph indexes (0-based) within the chapter text. */
  paragraphStart: number;
  paragraphEnd: number;
  /** Half-open range `[charStart, charEnd)` into the chapter text. */
  charStart: number;
  charEnd: number;
}

export interface Chunk {
  /** Stable across re-imports of the same bytes: `<hash prefix>:<chapter>:<position>`. */
  id: string;
  /** Always equals `chapter.text.slice(locator.charStart, locator.charEnd)`. */
  text: string;
  locator: ChunkLocator;
}

export interface Chapter {
  /** 1-based, matches the table of contents even when a chapter has no text. */
  number: number;
  title: string;
  /** Plain text; paragraphs are separated by a blank line (`\n\n`). */
  text: string;
}

export interface Book {
  /** Lowercase hex SHA-256 of the EPUB bytes; doubles as the book's identity. */
  hash: string;
  /** Empty string when the EPUB declares no title. */
  title: string;
  authors: string[];
  language: string;
  sourceFilename?: string;
  chapters: Chapter[];
  chunks: Chunk[];
}

export interface RegistryEntry {
  hash: string;
  title: string;
  authors: string[];
  language: string;
  sourceFilename?: string;
  chapterCount: number;
  chunkCount: number;
  /** ISO 8601 timestamp. */
  importedAt: string;
}

/**
 * Record of imported books. Async so a file- or SQLite-backed store can replace the
 * in-memory one. Implementations must satisfy the shared contract tests.
 */
export interface Registry {
  get(hash: string): Promise<RegistryEntry | undefined>;
  /** Entries whose normalised title or source filename matches (see `normalizeForMatch`). */
  findByTitleOrFilename(
    title: string,
    filename?: string,
  ): Promise<RegistryEntry[]>;
  /** Rejects with a `DuplicateHashError` when an entry with the same hash exists. */
  add(entry: RegistryEntry): Promise<void>;
  list(): Promise<RegistryEntry[]>;
  /** Removes only the registry's record. Returns whether an entry was removed. */
  remove(hash: string): Promise<boolean>;
}

export interface ChunkingOptions {
  /** Close a chunk once it reaches this many characters. */
  targetSize?: number;
  /** No chunk exceeds this many characters. */
  maxSize?: number;
}

export interface IngestOptions {
  /** Source file name, used for possible-duplicate detection. */
  filename?: string;
  registry: Registry;
  chunking?: ChunkingOptions;
}

export type IngestResult =
  | { status: 'existing'; entry: RegistryEntry }
  | { status: 'new'; book: Book }
  | { status: 'possible-duplicate'; book: Book; candidates: RegistryEntry[] }
  | { status: 'error'; error: IngestError };
