import type { Book, Chunk } from '../../ingest/types';

/**
 * A small book for indexing tests: `chunkCounts[i]` chunks in chapter `i + 1`. A count of
 * zero makes a chapter with no text, so no chunks. Chunk text is unique and easy to spot.
 */
export function makeIndexableBook(
  chunkCounts: readonly number[],
  hash = 'a'.repeat(64),
): Book {
  const chunks: Chunk[] = [];
  const chapters = chunkCounts.map((count, position) => {
    const number = position + 1;
    const texts = Array.from(
      { length: count },
      (_, index) =>
        `Chapter ${number} passage ${index} tells of a distinct event.`,
    );
    let offset = 0;
    texts.forEach((text, index) => {
      chunks.push({
        id: `${hash.slice(0, 16)}:${number}:${index}`,
        text,
        locator: {
          chapterNumber: number,
          chapterTitle: `Chapter ${number}`,
          paragraphStart: index,
          paragraphEnd: index,
          charStart: offset,
          charEnd: offset + text.length,
        },
      });
      offset += text.length + 2;
    });
    return { number, title: `Chapter ${number}`, text: texts.join('\n\n') };
  });
  return {
    hash,
    title: 'A Test Book',
    authors: ['Someone'],
    language: 'en',
    chapters,
    chunks,
  };
}
