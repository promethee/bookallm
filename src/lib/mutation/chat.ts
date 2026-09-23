import type { AnswerError, ChatMessage } from '../answering';
import { streamChat } from '../answering';
import type { OllamaClient } from '../ollama';
import { TRIGGER } from './defaults';
import type { MutationError } from './types';

export type RunPromptResult =
  | { status: 'ok'; text: string }
  | { status: 'aborted' }
  | { status: 'failed'; error: MutationError };

/** `AnswerError`'s three codes are exactly `MutationError`'s chat-related ones. */
const asMutationError = (error: AnswerError): MutationError => ({
  code: error.code,
  detail: error.detail,
});

/**
 * Sends `systemPrompt` as a system message plus a fixed trigger as the user message,
 * drains `streamChat`'s generator, and returns the complete text as one plain string.
 * Every one of this module's three chat calls (extraction, mutation, verification) is a
 * single, standalone exchange - never a multi-turn conversation - so there is no reason
 * to expose streaming here: a claim is a sentence or two, not a long answer worth
 * showing token by token.
 */
export async function runPrompt(
  client: OllamaClient,
  model: string,
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<RunPromptResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: TRIGGER },
  ];
  const result = await streamChat(client, model, messages, { signal });
  if (result.status === 'aborted') return { status: 'aborted' };
  if (result.status === 'failed')
    return { status: 'failed', error: asMutationError(result.error) };

  let text = '';
  try {
    for await (const chunk of result.chunks) text += chunk;
  } catch (error) {
    if (signal?.aborted) return { status: 'aborted' };
    return {
      status: 'failed',
      error: asMutationError(error as AnswerError),
    };
  }
  return { status: 'ok', text: text.trim() };
}
