import type { OllamaClient } from '../ollama';
import { runPrompt } from './chat';
import { extractionPrompt, NO_CLAIM_WORD } from './defaults';
import type { ChangedAttribute, MutationError } from './types';

export type ExtractResult =
  /** `claim` is undefined when the passage has no claim of the kind asked for. */
  | { status: 'ok'; claim?: string; raw: string }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

/** The first word of `text`, letters only, uppercased ("None." → "NONE"). */
export const firstWord = (text: string): string =>
  (text.trim().split(/\s+/)[0] ?? '').replace(/[^\p{L}]/gu, '').toUpperCase();

/**
 * Asks the chat model for one concrete, checkable claim of `kind` that the passage text
 * supports. An empty reply, or one starting with `NO_CLAIM_WORD`, means the passage has
 * none.
 */
export async function extractClaim(
  client: OllamaClient,
  model: string,
  passageText: string,
  kind: ChangedAttribute,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  const result = await runPrompt(
    client,
    model,
    extractionPrompt(passageText, kind),
    signal,
  );
  if (result.status !== 'ok') return result;

  const claim = result.text;
  if (!claim || firstWord(claim) === NO_CLAIM_WORD)
    return { status: 'ok', raw: result.text };
  return { status: 'ok', claim, raw: result.text };
}
