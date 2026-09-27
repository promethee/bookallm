import type { Book, Chunk } from '../ingest/types';
import {
  FRONT_BACK_MATTER_TEXT,
  FRONT_BACK_MATTER_TITLES,
  MIN_CLAIM_CHUNK_LENGTH,
} from './defaults';

export type PickChunkResult =
  { status: 'ok'; chunk: Chunk } | { status: 'no-chunks-available' };

/** Lowercase, accents removed and curly apostrophes made straight, for title matching. */
const normalizeTitle = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toLowerCase()
    .trim();

/**
 * Whether `chunk` should not be used for a claim: it belongs to front or back matter (by
 * its chapter title, or Project Gutenberg boilerplate in its text), or is too short to
 * hold a fair claim. Ask mode still searches these chunks; only claim selection skips them.
 */
export function isUnfitForClaim(chunk: Chunk): boolean {
  if (chunk.text.trim().length < MIN_CLAIM_CHUNK_LENGTH) return true;
  if (FRONT_BACK_MATTER_TEXT.test(chunk.text)) return true;
  const title = normalizeTitle(chunk.locator.chapterTitle);
  return FRONT_BACK_MATTER_TITLES.some((pattern) => pattern.test(title));
}

/**
 * Picks one of `book`'s chunks uniformly at random, skipping front and back matter and
 * any id in `excludeChunkIds`. When the whole book has nothing but front and back matter,
 * every chunk is eligible instead; that fallback looks at the book, not at what is left
 * after exclusions, so a session that has used every story passage is told so (and can
 * start over) rather than being served the introduction.
 * `random` defaults to `Math.random` and is injectable so a test can pick predictably.
 */
export function pickChunk(
  book: Book,
  excludeChunkIds: readonly string[] = [],
  random: () => number = Math.random,
): PickChunkResult {
  const fit = book.chunks.filter((chunk) => !isUnfitForClaim(chunk));
  const eligible = fit.length > 0 ? fit : book.chunks;
  const excluded = new Set(excludeChunkIds);
  const available = eligible.filter((chunk) => !excluded.has(chunk.id));
  if (available.length === 0) return { status: 'no-chunks-available' };

  const index = Math.floor(random() * available.length);
  // A random() that returns exactly 1 (out of range in practice, but not impossible for
  // a hand-written test double) would otherwise index past the end.
  const clamped = Math.min(index, available.length - 1);
  return { status: 'ok', chunk: available[clamped] };
}
