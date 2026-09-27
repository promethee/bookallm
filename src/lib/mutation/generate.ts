import type { Book, Chunk } from '../ingest/types';
import type { OllamaClient } from '../ollama';
import {
  CLAIM_KINDS,
  MUTATION_FRESH_PASSAGE_ATTEMPTS,
  MIN_CLAIM_WORDS,
  MUTATION_VERIFY_RETRIES,
  type RejectedChange,
} from './defaults';
import { diffClaims, rejectChanges } from './diff';
import { extractClaim } from './extract';
import { generateMutation } from './mutate';
import { pickChunk } from './select';
import type {
  ChangedAttribute,
  ClaimChange,
  ClaimStep,
  MutationError,
  MutationResult,
} from './types';
import { verifyContradiction } from './verify';

export interface GenerateClaimOptions {
  /** The active, indexed book to build a claim from. */
  book: Book;
  /** The configured chat model. */
  model: string;
  client: OllamaClient;
  /** Chunk ids to skip, so a session does not repeat the same source too soon. */
  excludeChunkIds?: readonly string[];
  /** Defaults to `Math.random`; injectable for deterministic tests. */
  random?: () => number;
  signal?: AbortSignal;
  /** Called after each step with what the model said, for diagnostics only. */
  onStep?: (step: ClaimStep) => void;
}

/** What one chunk yielded: a confirmed pair of claims, or why it did not. */
type ChunkOutcome =
  | {
      status: 'ok';
      trueClaim: string;
      changedClaim: string;
      kind: ChangedAttribute;
      changes: ClaimChange[];
    }
  | { status: 'no-claim' }
  | { status: 'unverified' }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

interface ChunkContext {
  client: OllamaClient;
  model: string;
  kinds: readonly ChangedAttribute[];
  signal?: AbortSignal;
  report: (step: ClaimStep) => void;
}

/** The claim kinds in an unpredictable order (Fisher-Yates with the injected `random`). */
function shuffledKinds(random: () => number): ChangedAttribute[] {
  const kinds = [...CLAIM_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(random() * (i + 1)), i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds;
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Milliseconds since the call, read when the returned function is called. */
const startTimer = () => {
  const started = performance.now();
  return () => Math.round(performance.now() - started);
};

/**
 * Extracts a claim of the first kind (in `kinds` order) the chunk has, at least
 * `MIN_CLAIM_WORDS` long, then asks for a
 * changed version up to `1 + MUTATION_VERIFY_RETRIES` times. A version is rejected when it
 * cannot be read, changes nothing or too much (word diff), or is not confirmed false by
 * the verification check; each retry lists the rejected versions and why.
 */
async function attemptChunk(
  chunk: Chunk,
  context: ChunkContext,
): Promise<ChunkOutcome> {
  const { client, model, kinds, signal, report } = context;

  let trueClaim: string | undefined;
  let kind: ChangedAttribute | undefined;
  for (const candidate of kinds) {
    const elapsed = startTimer();
    const extracted = await extractClaim(
      client,
      model,
      chunk.text,
      candidate,
      signal,
    );
    if (extracted.status !== 'ok') return extracted;
    const tooShort =
      extracted.claim !== undefined &&
      wordCount(extracted.claim) < MIN_CLAIM_WORDS;
    report({
      stage: 'extract',
      chunkId: chunk.id,
      ms: elapsed(),
      kind: candidate,
      raw: extracted.raw,
      outcome: tooShort ? 'too-short' : extracted.claim ? 'claim' : 'none',
    });
    if (extracted.claim && !tooShort) {
      trueClaim = extracted.claim;
      kind = candidate;
      break;
    }
  }
  if (!trueClaim || !kind) return { status: 'no-claim' };
  const trueWordCount = wordCount(trueClaim);

  const rejected: RejectedChange[] = [];
  for (let attempt = 0; attempt <= MUTATION_VERIFY_RETRIES; attempt++) {
    let elapsed = startTimer();
    const mutation = await generateMutation(
      client,
      model,
      chunk.text,
      trueClaim,
      kind,
      rejected,
      signal,
    );
    if (mutation.status === 'aborted' || mutation.status === 'failed')
      return mutation;
    const mutateStep = {
      stage: 'mutate',
      chunkId: chunk.id,
      ms: elapsed(),
      kind,
      attempt,
      raw: mutation.raw,
    } as const;
    if (mutation.status === 'unreadable') {
      report({ ...mutateStep, outcome: 'rejected', reason: 'unreadable' });
      rejected.push({
        claim: mutation.raw.replace(/\s+/g, ' ').trim(),
        reason: 'unreadable',
      });
      continue;
    }
    const changes = diffClaims(trueClaim, mutation.claim);
    const reason = rejectChanges(changes, trueWordCount);
    if (reason) {
      report({ ...mutateStep, outcome: 'rejected', reason });
      rejected.push({ claim: mutation.claim, reason });
      continue;
    }
    report({ ...mutateStep, outcome: 'changed' });

    elapsed = startTimer();
    const verified = await verifyContradiction(
      client,
      model,
      chunk.text,
      mutation.claim,
      signal,
    );
    if (verified.status !== 'ok') return verified;
    report({
      stage: 'verify',
      chunkId: chunk.id,
      ms: elapsed(),
      attempt,
      raw: verified.raw,
      outcome: verified.confirmed ? 'confirmed' : 'not-confirmed',
    });
    if (verified.confirmed)
      return {
        status: 'ok',
        trueClaim,
        changedClaim: mutation.claim,
        kind,
        changes,
      };
    rejected.push({ claim: mutation.claim, reason: 'still-true' });
  }
  return { status: 'unverified' };
}

const UNVERIFIED_DETAIL: Record<'no-claim' | 'unverified', string> = {
  'no-claim': 'No passage yielded a claim of any kind.',
  unverified: 'No changed claim was confirmed to contradict its passage.',
};

/**
 * Picks a chunk (skipping front and back matter), extracts a true claim of a kind chosen
 * in code, generates a changed version of that kind and verifies it actually contradicts
 * the source (see `attemptChunk`). When that chunk yields nothing, the whole attempt is
 * repeated on a different chunk, `MUTATION_FRESH_PASSAGE_ATTEMPTS` times, before reporting
 * `unverified`. Only then, with a confirmed pair in hand, is one of the two versions
 * chosen unpredictably, always with the real citation and the true claim; a failed change
 * never falls back to offering the true claim. Never throws for an expected outcome.
 */
export async function generateClaim(
  options: GenerateClaimOptions,
): Promise<MutationResult> {
  const {
    book,
    model,
    client,
    excludeChunkIds = [],
    random = Math.random,
    signal,
    onStep,
  } = options;
  if (signal?.aborted) return { status: 'aborted' };
  const report = (step: ClaimStep) => onStep?.(step);

  const tried: string[] = [];
  let lastFailure: 'no-claim' | 'unverified' = 'unverified';
  for (let passage = 0; passage <= MUTATION_FRESH_PASSAGE_ATTEMPTS; passage++) {
    const picked = pickChunk(book, [...excludeChunkIds, ...tried], random);
    if (picked.status === 'no-chunks-available') {
      // Nothing to pick at all is its own failure; nothing left for a fresh attempt is not.
      if (passage === 0)
        return { status: 'failed', error: { code: 'no-chunks-available' } };
      break;
    }
    const { chunk } = picked;
    tried.push(chunk.id);
    report({ stage: 'pick', chunkId: chunk.id, ms: 0 });

    const outcome = await attemptChunk(chunk, {
      client,
      model,
      kinds: shuffledKinds(random),
      signal,
      report,
    });
    if (outcome.status === 'aborted' || outcome.status === 'failed')
      return outcome;
    if (outcome.status !== 'ok') {
      lastFailure = outcome.status;
      continue;
    }

    const isTrue = random() < 0.5;
    return {
      status: 'ok',
      claim: {
        claim: isTrue ? outcome.trueClaim : outcome.changedClaim,
        isTrue,
        trueClaim: outcome.trueClaim,
        changedAttribute: isTrue ? undefined : outcome.kind,
        changes: isTrue ? undefined : outcome.changes,
        citation: {
          chunkId: chunk.id,
          locator: chunk.locator,
          text: chunk.text,
        },
        difficulty: 'flat',
      },
    };
  }
  return {
    status: 'failed',
    error: { code: 'unverified', detail: UNVERIFIED_DETAIL[lastFailure] },
  };
}
