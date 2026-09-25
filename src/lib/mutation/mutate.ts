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

const findKeyword = (text: string): ChangedAttribute | undefined => {
  for (const [attribute, pattern] of Object.entries(ATTRIBUTE_KEYWORDS)) {
    if (pattern.test(text)) return attribute as ChangedAttribute;
  }
  return undefined;
};

/**
 * Finds which known attribute the response names, and the changed claim, tolerating a
 * model that drops the requested `ATTRIBUTE:`/`CLAIM:` labels (seen in real use: a bare
 * first line like `ORDER` followed by the claim, no labels at all).
 */
function parseMutation(
  text: string,
): { attribute: ChangedAttribute; claim: string } | undefined {
  const attributeLine = /attribute:\s*(.+)/i.exec(text)?.[1];
  const claimLine = /claim:\s*(.+)/i.exec(text)?.[1]?.trim();
  const labelledAttribute = attributeLine && findKeyword(attributeLine);
  if (labelledAttribute && claimLine)
    return { attribute: labelledAttribute, claim: claimLine };

  // Fallback: an unlabelled short first line naming the attribute, rest is the claim.
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length >= 2 && lines[0].length <= 20) {
    const bareAttribute = findKeyword(lines[0]);
    if (bareAttribute)
      return { attribute: bareAttribute, claim: lines.slice(1).join(' ') };
  }
  return undefined;
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

  const parsed = parseMutation(result.text);
  if (!parsed)
    return {
      status: 'failed',
      error: {
        code: 'chat-failed',
        detail: `Could not read an attribute and claim from: ${result.text}`,
      },
    };
  return { status: 'ok', claim: parsed.claim, attribute: parsed.attribute };
}
