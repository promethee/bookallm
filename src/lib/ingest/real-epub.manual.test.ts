// @vitest-environment node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryRegistry, ingestEpub } from './index';

/**
 * Manual check against a real EPUB. Skipped unless `EPUB_PATH` points at a file:
 *
 *   EPUB_PATH=/path/to/book.epub pnpm exec vitest run real-epub
 *
 * It prints the title, chapter titles and one sample chunk so a human can compare
 * them with the book. Citation accuracy is a judgment call, not an automated check.
 */
const epubPath = process.env.EPUB_PATH;

describe.skipIf(!epubPath)('real EPUB (manual check)', () => {
  it('ingests the file and prints what it found', async () => {
    const bytes = new Uint8Array(readFileSync(epubPath!));

    const result = await ingestEpub(bytes, {
      registry: new InMemoryRegistry(),
      filename: basename(epubPath!),
    });

    expect(result.status, JSON.stringify(result)).toBe('new');
    if (result.status !== 'new') return;
    const { book } = result;
    const sample = book.chunks[Math.floor(book.chunks.length / 2)];

    console.log(
      [
        `title:    ${book.title}`,
        `authors:  ${book.authors.join('; ')}`,
        `language: ${book.language}`,
        `chapters: ${book.chapters.length}`,
        `chunks:   ${book.chunks.length}`,
        'chapter titles:',
        ...book.chapters.map(
          (c) =>
            `  ${String(c.number).padStart(3)}. ${c.title} (${c.text.length} chars)`,
        ),
        `sample chunk ${sample.id} (${JSON.stringify(sample.locator)}):`,
        sample.text,
      ].join('\n'),
    );

    expect(book.chapters.length).toBeGreaterThan(0);
    expect(book.chunks.length).toBeGreaterThan(0);
  });
});
