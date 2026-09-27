import type { Book } from '../ingest/types';
import type { OllamaClient } from '../ollama';
import { MUTATION_VERIFY_RETRIES } from './defaults';
import { extractClaim } from './extract';
import { generateMutation } from './mutate';
import { pickChunk } from './select';
import type { ChangedAttribute, ClaimStep, MutationResult } from './types';
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

/**
 * Picks a chunk, extracts a true claim from it, generates a changed version and verifies
 * it actually contradicts the source (retrying the mutation, not the extraction, up to
 * `MUTATION_VERIFY_RETRIES` times), then returns one of the two versions - chosen
 * unpredictably - always with the real citation. Never throws for an expected outcome.
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
  const timed = () => {
    const started = performance.now();
    return () => Math.round(performance.now() - started);
  };
  if (signal?.aborted) return { status: 'aborted' };

  const picked = pickChunk(book, excludeChunkIds, random);
  if (picked.status === 'no-chunks-available')
    return { status: 'failed', error: { code: 'no-chunks-available' } };
  const { chunk } = picked;
  onStep?.({ stage: 'pick', chunkId: chunk.id, ms: 0 });

  let elapsed = timed();
  const extracted = await extractClaim(client, model, chunk.text, signal);
  if (extracted.status !== 'ok') return extracted;
  onStep?.({
    stage: 'extract',
    chunkId: chunk.id,
    ms: elapsed(),
    raw: extracted.text,
    outcome: 'claim',
  });
  const trueClaim = extracted.text;

  let changed: { claim: string; attribute: ChangedAttribute } | undefined;
  for (let attempt = 0; attempt <= MUTATION_VERIFY_RETRIES; attempt++) {
    elapsed = timed();
    const mutation = await generateMutation(
      client,
      model,
      chunk.text,
      trueClaim,
      signal,
    );
    if (mutation.status === 'unreadable') {
      onStep?.({
        stage: 'mutate',
        chunkId: chunk.id,
        ms: elapsed(),
        attempt,
        raw: mutation.raw,
        outcome: 'rejected',
        reason: 'unreadable',
      });
      return {
        status: 'failed',
        error: {
          code: 'chat-failed',
          detail: `Could not read an attribute and claim from: ${mutation.raw}`,
        },
      };
    }
    if (mutation.status !== 'ok') return mutation;
    onStep?.({
      stage: 'mutate',
      chunkId: chunk.id,
      ms: elapsed(),
      attempt,
      kind: mutation.attribute,
      raw: mutation.raw,
      outcome: 'changed',
    });

    elapsed = timed();
    const verified = await verifyContradiction(
      client,
      model,
      chunk.text,
      mutation.claim,
      signal,
    );
    if (verified.status !== 'ok') return verified;
    onStep?.({
      stage: 'verify',
      chunkId: chunk.id,
      ms: elapsed(),
      attempt,
      raw: verified.raw,
      outcome: verified.confirmed ? 'confirmed' : 'not-confirmed',
    });

    if (verified.confirmed) {
      changed = { claim: mutation.claim, attribute: mutation.attribute };
      break;
    }
  }
  if (!changed) return { status: 'failed', error: { code: 'unverified' } };

  const isTrue = random() < 0.5;
  return {
    status: 'ok',
    claim: {
      claim: isTrue ? trueClaim : changed.claim,
      isTrue,
      changedAttribute: isTrue ? undefined : changed.attribute,
      citation: { chunkId: chunk.id, locator: chunk.locator, text: chunk.text },
      difficulty: 'flat',
    },
  };
}
