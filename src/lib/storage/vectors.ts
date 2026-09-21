import type { ChapterVectors } from '../indexing/types';

/**
 * Rejects a record that could not be read back correctly: a missing or fractional
 * chapter number, an empty vector length, or a vector array that does not hold exactly
 * one vector per chunk id. Both stores call this before writing anything, so a bad
 * record leaves nothing behind.
 */
export function assertChapterVectors(record: ChapterVectors): void {
  if (!Number.isInteger(record.chapter) || record.chapter < 1)
    throw new TypeError('A chapter number is a whole number from 1');
  if (!Number.isInteger(record.dimension) || record.dimension < 1)
    throw new TypeError('A vector needs at least one number');
  if (record.vectors.length !== record.chunkIds.length * record.dimension)
    throw new TypeError('There must be one vector for every chunk');
}

/** A private copy, so neither side can change what the other holds. */
export function copyChapterVectors(record: ChapterVectors): ChapterVectors {
  return {
    ...record,
    chunkIds: [...record.chunkIds],
    vectors: new Float32Array(record.vectors),
  };
}
