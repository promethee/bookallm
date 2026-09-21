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
 * Measured, not guessed: with the real `bge-m3` on 100 chunks (chapters I to XIII) of the
 * real Pride and Prejudice, the best score per question was 0.5247 to 0.6679 for 10
 * questions the text answers and 0.3287 to 0.3869 for 6 questions about other things.
 * The value is the midpoint of that gap (0.4558), rounded. Questions about the book's
 * own subject that the indexed part does not answer scored 0.4676 to 0.6716, so this
 * cutoff cannot tell "on topic but not there" from an answer: judging that is left to the
 * answer step. See the design of the `passage-retrieval` change for the full data and its
 * limits (one book, part of it, English, one model).
 */
export const RELEVANCE_CUTOFF = 0.46;
