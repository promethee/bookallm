import type { Book, Chunk } from '../ingest/types';

export type PickChunkResult =
  { status: 'ok'; chunk: Chunk } | { status: 'no-chunks-available' };

/**
 * Picks one of `book`'s chunks uniformly at random, skipping any id in `excludeChunkIds`.
 * `random` defaults to `Math.random` and is injectable so a test can pick predictably.
 */
export function pickChunk(
  book: Book,
  excludeChunkIds: readonly string[] = [],
  random: () => number = Math.random,
): PickChunkResult {
  const excluded = new Set(excludeChunkIds);
  const available = book.chunks.filter((chunk) => !excluded.has(chunk.id));
  if (available.length === 0) return { status: 'no-chunks-available' };

  const index = Math.floor(random() * available.length);
  // A random() that returns exactly 1 (out of range in practice, but not impossible for
  // a hand-written test double) would otherwise index past the end.
  const clamped = Math.min(index, available.length - 1);
  return { status: 'ok', chunk: available[clamped] };
}
