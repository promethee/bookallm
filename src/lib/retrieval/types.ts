import type { ChunkLocator } from '../ingest/types';

/**
 * Stable, machine-readable failure codes for retrieval. The core carries no display text:
 * the interface maps a code to a message in the reader's language.
 */
export type RetrievalErrorCode =
  /** Ollama could not be reached, or did not answer in time. */
  | 'unreachable'
  | 'model-not-found'
  /** Ollama answered, but not with vectors that can be used. */
  | 'embed-failed'
  /** The book has no complete index for the configured embedding model. */
  | 'not-indexed'
  | 'empty-question'
  /** The question's vector is not as long as the stored ones, so they cannot be compared. */
  | 'index-mismatch';

export interface RetrievalError {
  code: RetrievalErrorCode;
  /** Ollama's own message, or what went wrong, kept for diagnostics. */
  detail?: string;
}

/** One chunk of the book that matches a question, with where it sits and how well it matches. */
export interface Passage {
  chunkId: string;
  /** Equals the chapter text at `locator`'s range. */
  text: string;
  locator: ChunkLocator;
  /** Cosine similarity with the question, from -1 to 1 (higher is closer). */
  score: number;
}

/**
 * Whether the best passage is close enough to the question to be worth answering from.
 * It says nothing about the book: `nothing-relevant` is not "the book has no answer".
 */
export type Verdict = 'relevant' | 'nothing-relevant';

export type RetrievalResult =
  /** `passages` are ranked best first, whatever the verdict. */
  | { status: 'ok'; verdict: Verdict; passages: Passage[] }
  /** The caller aborted while waiting for Ollama. */
  | { status: 'aborted' }
  | { status: 'failed'; error: RetrievalError };
