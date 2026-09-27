import type { OllamaClient } from '../ollama';
import { runPrompt } from './chat';
import { CONTRADICTION_WORD, verificationPrompt } from './defaults';
import { firstWord } from './extract';
import type { MutationError } from './types';

export type VerifyResult =
  /** `confirmed` is false for an answer that did not start with `CONTRADICTION_WORD`. */
  | {
      status: 'ok';
      confirmed: boolean;
      /** The model's reply as received, for diagnostics. */
      raw: string;
    }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

/**
 * Asks the chat model whether `changedClaim` is false according to `passageText`. Only an
 * answer whose first word (after an optional `Answer:` label) is `CONTRADICTION_WORD`
 * counts as confirmed. Anything else - the other word, a sentence such as "It is not
 * false", or no clear answer - is treated as not confirmed, the same as a "no": this check
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

  const answer = result.text.replace(/^\s*answer\s*:\s*/i, '');
  return {
    status: 'ok',
    confirmed: firstWord(answer) === CONTRADICTION_WORD,
    raw: result.text,
  };
}
