import type { Book } from '../ingest/types';
import type { OllamaClient } from '../ollama';
import { MUTATION_VERIFY_RETRIES } from './defaults';
import { extractClaim } from './extract';
import { generateMutation } from './mutate';
import { pickChunk } from './select';
import type { ChangedAttribute, MutationResult } from './types';
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
  } = options;
  if (signal?.aborted) return { status: 'aborted' };

  const picked = pickChunk(book, excludeChunkIds, random);
  if (picked.status === 'no-chunks-available')
    return { status: 'failed', error: { code: 'no-chunks-available' } };
  const { chunk } = picked;

  const extracted = await extractClaim(client, model, chunk.text, signal);
  if (extracted.status !== 'ok') return extracted;
  const trueClaim = extracted.text;

  let changed: { claim: string; attribute: ChangedAttribute } | undefined;
  for (let attempt = 0; attempt <= MUTATION_VERIFY_RETRIES; attempt++) {
    const mutation = await generateMutation(
      client,
      model,
      chunk.text,
      trueClaim,
      signal,
    );
    if (mutation.status !== 'ok') return mutation;

    const verified = await verifyContradiction(
      client,
      model,
      chunk.text,
      mutation.claim,
      signal,
    );
    if (verified.status !== 'ok') return verified;

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
