import type { Book, Chapter, Chunk } from './types';

/** A chapter by its 1-based number, with its full text. */
export const getChapter = (
  book: Pick<Book, 'chapters'>,
  number: number,
): Chapter | undefined =>
  book.chapters.find((chapter) => chapter.number === number);

/** The chunks of one chapter, in reading order. */
export const chunksOfChapter = (
  book: Pick<Book, 'chunks'>,
  number: number,
): Chunk[] =>
  book.chunks.filter((chunk) => chunk.locator.chapterNumber === number);
