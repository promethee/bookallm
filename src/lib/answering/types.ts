import type { ChunkLocator } from '../ingest/types';

/**
 * Stable, machine-readable failure codes for answer generation. The core carries no
 * display text: the interface maps a code to a message in the reader's language.
 */
export type AnswerErrorCode = 'unreachable' | 'model-not-found' | 'chat-failed';

export interface AnswerError {
  code: AnswerErrorCode;
  /** Ollama's own message, or what went wrong, kept for diagnostics. */
  detail?: string;
}

/** One passage as offered to the chat model: its 1-based position in the prompt, and its text. */
export interface OfferedPassage {
  /** 1-based, matching the number the model is asked to cite (`[1]`, `[2]`, …). */
  index: number;
  text: string;
  locator: ChunkLocator;
  chunkId: string;
}

/** A resolved citation: a marker the model wrote, tied back to the passage it named. */
export interface Citation {
  /** The passage's 1-based position, as cited. */
  passageIndex: number;
  chunkId: string;
  locator: ChunkLocator;
  /** Character offset of the marker in the complete answer text. */
  offset: number;
}
