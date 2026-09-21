/** How many passages a search returns unless told otherwise. */
export const DEFAULT_PASSAGE_COUNT = 5;

/**
 * The longest question, in characters, that is embedded; the rest is cut. A question is a
 * sentence or two, so this only guards against a pasted page.
 */
export const MAX_QUESTION_LENGTH = 2000;

/**
 * The best passage must score at least this (cosine similarity) for the verdict to be
 * `relevant`.
 *
 * PROVISIONAL: this is a placeholder, not a measurement. It is replaced by a value taken
 * from questions asked of a real book with the real `bge-m3`, with the data recorded in
 * the design of the `passage-retrieval` change.
 */
export const RELEVANCE_CUTOFF = 0.5;
