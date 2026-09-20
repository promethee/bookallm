import type { Book, Registry, RegistryEntry } from './types';

export type Classification =
  | { status: 'new' }
  | { status: 'possible-duplicate'; candidates: RegistryEntry[] };

/**
 * Classifies a freshly parsed book whose hash is not in the registry. A title or
 * source filename that matches a registered entry makes it a possible duplicate; the
 * book stays a distinct book either way and no entry is touched.
 */
export async function classifyImport(
  registry: Registry,
  book: Pick<Book, 'title' | 'sourceFilename'>,
): Promise<Classification> {
  const candidates = await registry.findByTitleOrFilename(
    book.title,
    book.sourceFilename,
  );
  return candidates.length > 0
    ? { status: 'possible-duplicate', candidates }
    : { status: 'new' };
}

/** The registry record for a book. `importedAt` defaults to now (ISO 8601). */
export function toRegistryEntry(
  book: Book,
  importedAt: string = new Date().toISOString(),
): RegistryEntry {
  return {
    hash: book.hash,
    title: book.title,
    authors: [...book.authors],
    language: book.language,
    sourceFilename: book.sourceFilename,
    chapterCount: book.chapters.length,
    chunkCount: book.chunks.length,
    importedAt,
  };
}
