import type { OllamaClient } from '../ollama';
import { runPrompt } from './chat';
import { verificationPrompt } from './defaults';
import type { MutationError } from './types';

export type VerifyResult =
  /** `confirmed` is false for an answer that did not clearly say CONTRADICTS. */
  | { status: 'ok'; confirmed: boolean }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

/**
 * Asks the chat model whether `changedClaim` actually contradicts `passageText`. An
 * answer that does not clearly say so - including one that says it matches, or one that
 * answers neither word - is treated as not confirmed, the same as a "no": this check
 * exists to keep a changed claim from being shown as false when it is not, so an unclear
 * answer must not be read as a yes.
 */
export async function verifyContradiction(
  client: OllamaClient,
  model: string,
  passageText: string,
  changedClaim: string,
  signal?: AbortSignal,
): Promise<VerifyResult> {
  const result = await runPrompt(
    client,
    model,
    verificationPrompt(passageText, changedClaim),
    signal,
  );
  if (result.status !== 'ok') return result;

  return { status: 'ok', confirmed: /contradict/i.test(result.text) };
}
