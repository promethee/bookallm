import type { ChunkLocator } from '../ingest/types';

/**
 * Stable, machine-readable failure codes for claim generation. The core carries no
 * display text: the interface maps a code to a message in the reader's language.
 */
export type MutationErrorCode =
  /** Ollama could not be reached, or did not answer in time. */
  | 'unreachable'
  | 'model-not-found'
  /** Ollama answered, but not with something usable at that step. */
  | 'chat-failed'
  /** Every chunk was excluded, or the book has none. */
  | 'no-chunks-available'
  /** A changed claim was never confirmed to contradict its source, even after retrying. */
  | 'unverified';

export interface MutationError {
  code: MutationErrorCode;
  /** Ollama's own message, or what went wrong, kept for diagnostics. */
  detail?: string;
}

/** Which concrete attribute a changed claim altered. */
export type ChangedAttribute = 'cause' | 'order' | 'who' | 'where';

/** The real chunk a claim was built from, to reveal once the reader has judged the claim. */
export interface ClaimCitation {
  chunkId: string;
  locator: ChunkLocator;
  text: string;
}

/** One claim to present, true or deliberately changed, with what it takes to check it. */
export interface MutationClaim {
  /** The claim text to present to the reader. */
  claim: string;
  /** Whether `claim` is the true version or the changed one. */
  isTrue: boolean;
  /** Which attribute was changed. Only set when `isTrue` is false. */
  changedAttribute?: ChangedAttribute;
  citation: ClaimCitation;
  /** Reserved for future adaptive difficulty; always `'flat'` in v1.1. */
  difficulty: 'flat';
}

/** Why a changed version was not kept. */
export type RejectReason =
  /** The verification check did not confirm it contradicts the source. */
  | 'still-true'
  /** Its words are the same as the true claim's. */
  | 'nothing-changed'
  /** It rewrites more of the claim than the documented limit. */
  | 'changed-too-much'
  /** No changed claim could be read from the model's reply. */
  | 'unreadable';

/**
 * One step of claim generation, reported through `GenerateClaimOptions.onStep` for
 * diagnostics (the manual real-claim test prints them). The app does not use it.
 */
export type ClaimStep = {
  chunkId: string;
  /** Milliseconds the step took; 0 for `pick`. */
  ms: number;
} & (
  | { stage: 'pick' }
  | {
      stage: 'extract';
      kind?: ChangedAttribute;
      raw: string;
      outcome: 'claim' | 'none';
    }
  | {
      stage: 'mutate';
      kind?: ChangedAttribute;
      /** 0-based: 0 is the first changed version for this chunk. */
      attempt: number;
      raw: string;
      outcome: 'changed' | 'rejected';
      reason?: RejectReason;
    }
  | {
      stage: 'verify';
      attempt: number;
      raw: string;
      outcome: 'confirmed' | 'not-confirmed';
    }
);

export type MutationResult =
  | { status: 'ok'; claim: MutationClaim }
  /** The caller aborted while waiting for Ollama. */
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };
