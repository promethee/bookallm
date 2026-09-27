import type { OllamaClient } from '../ollama';
import { runPrompt } from './chat';
import { mutationPrompt, type RejectedChange } from './defaults';
import type { ChangedAttribute, MutationError } from './types';

export type MutateResult =
  | {
      status: 'ok';
      claim: string;
      /** The model's reply as received, for diagnostics. */
      raw: string;
    }
  /** The model answered, but no claim could be read from its reply. */
  | { status: 'unreadable'; raw: string }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

/**
 * A line that only names a kind ("WHO", "ATTRIBUTE: where"): the prompt no longer asks
 * for one, but a model used to the old format may still write it before the claim.
 */
const KIND_LINE = /^(attribute\s*:.*|(cause|order|who|where)\W*)$/i;

/** The changed claim in a reply: its first line that is not a kind label, unlabelled. */
function readClaim(text: string): string | undefined {
  const line = text
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0 && !KIND_LINE.test(candidate));
  const claim = line
    ?.replace(/^(changed claim|false claim|claim)\s*:\s*/i, '')
    .replace(/^["“](.*)["”]$/, '$1')
    .trim();
  return claim || undefined;
}

/**
 * Asks the chat model for a false version of `trueClaim` that changes only its `kind`
 * detail, telling it which versions were already rejected for this chunk and why.
 */
export async function generateMutation(
  client: OllamaClient,
  model: string,
  passageText: string,
  trueClaim: string,
  kind: ChangedAttribute,
  rejected: readonly RejectedChange[] = [],
  signal?: AbortSignal,
): Promise<MutateResult> {
  const result = await runPrompt(
    client,
    model,
    mutationPrompt(passageText, trueClaim, kind, rejected),
    signal,
  );
  if (result.status !== 'ok') return result;

  const claim = readClaim(result.text);
  if (!claim) return { status: 'unreadable', raw: result.text };
  return { status: 'ok', claim, raw: result.text };
}
