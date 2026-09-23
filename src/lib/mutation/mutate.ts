import type { OllamaClient } from '../ollama';
import { runPrompt } from './chat';
import { mutationPrompt } from './defaults';
import type { ChangedAttribute, MutationError } from './types';

export type MutateResult =
  | { status: 'ok'; claim: string; attribute: ChangedAttribute }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

const ATTRIBUTE_KEYWORDS: Record<ChangedAttribute, RegExp> = {
  cause: /cause/i,
  order: /order/i,
  who: /who/i,
  where: /where/i,
};

/** Finds the `ATTRIBUTE:` line's value among the known kinds, case-insensitively. */
function parseAttribute(text: string): ChangedAttribute | undefined {
  const line = /attribute:\s*(.+)/i.exec(text)?.[1];
  if (!line) return undefined;
  for (const [attribute, pattern] of Object.entries(ATTRIBUTE_KEYWORDS)) {
    if (pattern.test(line)) return attribute as ChangedAttribute;
  }
  return undefined;
}

/** Finds the `CLAIM:` line's value, trimmed. */
function parseClaim(text: string): string | undefined {
  const line = /claim:\s*(.+)/i.exec(text)?.[1];
  return line?.trim() || undefined;
}

/**
 * Asks the chat model for a changed version of `trueClaim` that alters exactly one
 * attribute, and the label naming which one.
 */
export async function generateMutation(
  client: OllamaClient,
  model: string,
  passageText: string,
  trueClaim: string,
  signal?: AbortSignal,
): Promise<MutateResult> {
  const result = await runPrompt(
    client,
    model,
    mutationPrompt(passageText, trueClaim),
    signal,
  );
  if (result.status !== 'ok') return result;

  const attribute = parseAttribute(result.text);
  const claim = parseClaim(result.text);
  if (!attribute || !claim)
    return {
      status: 'failed',
      error: {
        code: 'chat-failed',
        detail: `Could not read an ATTRIBUTE and CLAIM line from: ${result.text}`,
      },
    };
  return { status: 'ok', claim, attribute };
}
