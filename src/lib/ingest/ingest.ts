import { assembleChapters } from './chapters';
import { chunkBook } from './chunk';
import { classifyImport } from './classify';
import { hashBytes } from './hash';
import { openEpub } from './open';
import type { Book, IngestOptions, IngestResult } from './types';

/**
 * Turns EPUB bytes into a structured, citable book, or says why it cannot.
 *
 * The hash is checked against the registry first, so a known book is returned as
 * `existing` without being parsed again. Otherwise the file is opened (DRM check
 * before any content is read), split into chapters and chunks, and classified as
 * `new` or `possible-duplicate`. Ingestion never writes to the registry: adding the
 * book is the caller's decision, so a possible duplicate can be confirmed first.
 *
 * Expected failures are returned as `error` results. Registry failures are not EPUB
 * problems and reject the promise instead.
 */
export async function ingestEpub(
  bytes: Uint8Array,
  options: IngestOptions,
): Promise<IngestResult> {
  const hash = await hashBytes(bytes);

  const existing = await options.registry.get(hash);
  if (existing) return { status: 'existing', entry: existing };

  const opened = openEpub(bytes);
  if (!opened.ok) return { status: 'error', error: opened.error };

  let book: Book;
  try {
    const chapters = assembleChapters(opened.value.files, opened.value.info);
    if (!chapters.ok) return { status: 'error', error: chapters.error };
    const { title, authors, language } = opened.value.info;
    book = {
      hash,
      title,
      authors,
      language,
      sourceFilename: options.filename,
      chapters: chapters.value,
      chunks: chunkBook(chapters.value, hash, options.chunking, language),
    };
  } catch {
    // Anything unexpected while reading the book's content means it is not usable.
    return { status: 'error', error: { code: 'malformed-epub' } };
  }

  const classification = await classifyImport(options.registry, book);
  return classification.status === 'new'
    ? { status: 'new', book }
    : {
        status: 'possible-duplicate',
        book,
        candidates: classification.candidates,
      };
}
