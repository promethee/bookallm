import type { OllamaClient } from '../ollama';
import { runPrompt, type RunPromptResult } from './chat';
import { extractionPrompt } from './defaults';

/** Asks the chat model for one concrete, checkable claim the passage text supports. */
export function extractClaim(
  client: OllamaClient,
  model: string,
  passageText: string,
  signal?: AbortSignal,
): Promise<RunPromptResult> {
  return runPrompt(client, model, extractionPrompt(passageText), signal);
}
